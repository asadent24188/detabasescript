export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="#3a2d24" />
      <path d="M8 23.5h16" stroke="#e7b15a" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M10 23V15.2c0-4.8 12-4.8 12 0V23" stroke="#f6f1e7" strokeWidth="1.7" />
      <path d="M16 21.4c1.6-2.2 3.1-2.4 3.1-4.1a3.1 3.1 0 0 0-6.2 0c0 1.7 1.5 1.9 3.1 4.1z" fill="#e07a45" />
    </svg>
  );
}
