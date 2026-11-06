import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Stripe from "stripe";
import type { Env } from "../config/env.js";

export interface ChargeRequest {
  invoiceNumber: string;
  amount: number;
  currency: string;
  description: string;
  paymentMethodId?: string;
}

export interface ChargeResult {
  provider: string;
  providerRef: string;
  status: "COMPLETED" | "PENDING" | "FAILED";
}

/**
 * Payment provider integration interface.
 * - `mock` (default): records a synthetic successful charge. Safe for dev.
 * - `stripe`: creates a real Stripe PaymentIntent when STRIPE_SECRET_KEY is set.
 * No card data ever touches this system — providers handle PAN/CVV.
 */
export interface PaymentProvider {
  readonly name: string;
  charge(req: ChargeRequest): Promise<ChargeResult>;
}

@Injectable()
export class MockPaymentProvider implements PaymentProvider {
  readonly name = "mock";
  async charge(req: ChargeRequest): Promise<ChargeResult> {
    return { provider: "mock", providerRef: `mock_${Date.now()}_${req.invoiceNumber}`, status: "COMPLETED" };
  }
}

@Injectable()
export class StripePaymentProvider implements PaymentProvider {
  readonly name = "stripe";
  private readonly logger = new Logger(StripePaymentProvider.name);
  private client: Stripe | null = null;

  constructor(private readonly config: ConfigService<Env, true>) {}

  private async stripe(): Promise<Stripe> {
    if (this.client) return this.client;
    const key = this.config.get("STRIPE_SECRET_KEY", { infer: true });
    if (!key) throw new ServiceUnavailableException("Stripe is not configured. Set STRIPE_SECRET_KEY or use PAYMENT_PROVIDER=mock.");
    this.client = new Stripe(key);
    return this.client;
  }

  async charge(req: ChargeRequest): Promise<ChargeResult> {
    const stripe = await this.stripe();
    if (!req.paymentMethodId) {
      throw new ServiceUnavailableException("paymentMethodId required for Stripe charges");
    }
    const intent = await stripe.paymentIntents.create({
      amount: Math.round(req.amount * 100),
      currency: req.currency.toLowerCase(),
      description: req.description,
      payment_method: req.paymentMethodId,
      confirm: true,
      automatic_payment_methods: { enabled: true, allow_redirects: "never" },
      metadata: { invoiceNumber: req.invoiceNumber },
    });
    this.logger.log(`Stripe PaymentIntent ${intent.id} status=${intent.status}`);
    return {
      provider: "stripe",
      providerRef: intent.id,
      status: intent.status === "succeeded" ? "COMPLETED" : intent.status === "processing" ? "PENDING" : "FAILED",
    };
  }
}
