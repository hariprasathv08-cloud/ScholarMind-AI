import type { SVGProps } from "react";

interface LogoProps extends SVGProps<SVGSVGElement> {
  variant?: "square" | "mark";
}

export function Logo({ className = "h-8 w-8", variant = "square", ...props }: LogoProps) {
  if (variant === "mark") {
    return (
      <svg
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        {...props}
      >
        {/* Open Book */}
        <path
          d="M25 65C35 65 42 68 50 72C58 68 65 65 75 65M25 35V65M75 35V65M50 40V72"
          stroke="#3B82F6"
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Stylized Brain lobes */}
        <path
          d="M48 53C40 53 34 48 34 40C34 32 40 30 48 33"
          stroke="#6D28D9"
          strokeWidth="6"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M52 53C60 53 66 48 66 40C66 32 60 30 52 33"
          stroke="#6D28D9"
          strokeWidth="6"
          strokeLinecap="round"
          fill="none"
        />
        {/* Spark in the center top */}
        <path
          d="M50 16L52 24L60 26L52 28L50 36L48 28L40 26L48 24L50 16Z"
          fill="#F59E0B"
        />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      {/* Rounded flat container */}
      <rect width="100" height="100" rx="24" fill="#17171C" stroke="#2B2B35" strokeWidth="2" />
      
      {/* Open Book */}
      <path
        d="M25 65C35 65 42 68 50 72C58 68 65 65 75 65M25 35V65M75 35V65M50 40V72"
        stroke="#3B82F6"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Stylized Brain lobes */}
      <path
        d="M48 55C40 55 34 50 34 42C34 34 40 32 48 35"
        stroke="#6D28D9"
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M52 55C60 55 66 50 66 42C66 34 60 32 52 35"
        stroke="#6D28D9"
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
      />
      {/* Spark in the center top */}
      <path
        d="M50 18L52 26L60 28L52 30L50 38L48 30L40 28L48 26L50 18Z"
        fill="#F59E0B"
      />
    </svg>
  );
}
