import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plus-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AquaVitae",
  description: "Water refilling station operations & system dashboard",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={plusJakartaSans.variable}
      suppressHydrationWarning
    >
      <body
        className="min-h-screen bg-[#EFEFF2] font-sans text-[#111111] antialiased selection:bg-[#111111] selection:text-white"
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
