import type { Metadata } from "next";
import { DM_Sans, Manrope, Playfair_Display } from "next/font/google";
import { ThemeToggle } from "../components/theme-toggle";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-heading",
  subsets: ["latin"],
});

const dmSans = DM_Sans({
  variable: "--font-body",
  subsets: ["latin"],
});

const playfairDisplay = Playfair_Display({
  variable: "--font-editorial",
  subsets: ["latin"],
  style: ["italic"],
});

export const metadata: Metadata = {
  title: "Little Steps Nursery | A place to grow",
  description: "A nurturing environment where curiosity, creativity, and confidence grow every single day.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${manrope.variable} ${dmSans.variable} ${playfairDisplay.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <ThemeToggle />
      </body>
    </html>
  );
}
