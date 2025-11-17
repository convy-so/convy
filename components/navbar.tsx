import Link from "next/link";
import Image from "next/image";

export default function Navbar() {
  return (
    <nav className="sticky top-0 z-50 w-full bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 pt-6">
      <div className="mx-auto max-w-[1824px] grid h-16 grid-cols-3 items-center px-12">
        <Link href="/" className="flex items-center">
          <span className="text-xl font-bold text-foreground">convy</span>
        </Link>

        <div className="flex items-center justify-center">
          <Image
            src="/logo.svg"
            alt="Qatchup Logo"
            width={64}
            height={64}
            className="max-h-16 w-auto object-contain"
          />
        </div>

        {/* Navigation Items - Right aligned */}
        <div className="flex items-center justify-end gap-6">
          <Link
            href="/blog"
            className="text-[18px] font-medium text-[#292929] tracking-[-0.28px] transition-colors hover:text-[#292929]/80"
          >
            Blog
          </Link>
          <Link
            href="/waitlist"
            className="rounded-full bg-[#292929] px-[16px] py-[10px] text-[18px] font-medium tracking-[-0.28px] text-[#FAFAFA] transition-colors hover:bg-[#3a3a3a]"
          >
            Sign up to Waitlist
          </Link>
        </div>
      </div>
    </nav>
  );
}

