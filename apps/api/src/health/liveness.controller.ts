import { Controller, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Public } from "../common/decorators/public.decorator.js";

@ApiTags("liveness")
@Controller()
export class LivenessController {
  @Public()
  @Get("health")
  liveness() {
    return { status: "ok" };
  }

  @Public()
  @Get("ready")
  readiness() {
    return { status: "ok" };
  }
}
