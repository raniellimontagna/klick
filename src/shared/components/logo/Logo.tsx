import LogoPng from '@/assets/icon.png';

export function Logo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizes = {
    sm: {
      container: 'w-5 h-6 sm:w-6 sm:h-7',
      text: 'text-base sm:text-lg',
      gap: 'gap-2',
    },
    md: {
      container: 'w-8 h-10 sm:w-10 sm:h-12',
      text: 'text-xl sm:text-2xl',
      gap: 'gap-2 sm:gap-3',
    },
    lg: {
      container: 'w-10 h-12 sm:w-12 sm:h-14 md:w-14 md:h-16',
      text: 'text-2xl sm:text-3xl md:text-4xl',
      gap: 'gap-2 sm:gap-3',
    },
  };

  const s = sizes[size];

  return (
    <div className={`flex items-center ${s.gap}`}>
      <img src={LogoPng} alt="Klick Logo" className={`${s.container} shrink-0`} />
      <span className={`${s.text} font-bold text-primary tracking-tight`}>Klick</span>
    </div>
  );
}
