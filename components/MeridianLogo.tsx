export default function MeridianLogo({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle
        cx="32"
        cy="32"
        r="28"
        stroke="#10b981"
        strokeWidth="2"
        opacity="0.25"
      />

      <ellipse
        cx="32"
        cy="32"
        rx="14"
        ry="28"
        stroke="#10b981"
        strokeWidth="1.5"
        opacity="0.15"
      />

      <line
        x1="32"
        y1="2"
        x2="32"
        y2="62"
        stroke="url(#meridian-grad)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />

      <circle cx="32" cy="22" r="3" fill="#10b981" />

      <circle cx="32" cy="22" r="6" fill="#10b981" opacity="0.15" />

      <line
        x1="4"
        y1="32"
        x2="60"
        y2="32"
        stroke="#10b981"
        strokeWidth="1"
        opacity="0.1"
      />

      <defs>
        <linearGradient id="meridian-grad" x1="32" y1="2" x2="32" y2="62" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#10b981" stopOpacity="0.3" />
          <stop offset="0.35" stopColor="#10b981" stopOpacity="1" />
          <stop offset="0.65" stopColor="#10b981" stopOpacity="1" />
          <stop offset="1" stopColor="#10b981" stopOpacity="0.3" />
        </linearGradient>
      </defs>
    </svg>
  );
}
