import { useState } from 'react';

export const useScrambleGuideModal = () => {
  const [isOpen, setIsOpen] = useState(false);

  const openGuide = () => setIsOpen(true);
  const closeGuide = () => setIsOpen(false);

  return { isOpen, openGuide, closeGuide };
};
