import { CloseCircle, DangerTriangle } from '@solar-icons/react';
import { Button, Modal } from '@/shared/components/ui';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning';
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  variant = 'warning',
}: ConfirmDialogProps): React.ReactElement => {
  const getVariantStyles = () => {
    switch (variant) {
      case 'danger':
        return {
          iconColor: 'text-danger',
          buttonVariant: 'danger' as const,
        };
      case 'warning':
        return {
          iconColor: 'text-warning',
          buttonVariant: 'warning' as const,
        };
    }
  };

  const styles = getVariantStyles();

  const handleConfirm = (): void => {
    onConfirm();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm" ariaLabel={title} className="max-h-[90vh]">
      <div className="flex flex-col h-full">
        {/* Header */}
        <header className="flex items-start justify-between p-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <DangerTriangle
              className={`${styles.iconColor} shrink-0`}
              size={24}
              aria-hidden="true"
            />
            <h2 className="text-xl font-bold text-text-primary">{title}</h2>
          </div>
          <Button
            onClick={onClose}
            variant="ghost"
            size="icon"
            className="text-text-secondary hover:text-text-primary hover:bg-white/10 -mr-2 -mt-2"
            aria-label="Fechar diálogo"
          >
            <CloseCircle size={20} />
          </Button>
        </header>

        {/* Content */}
        <section className="p-6">
          <p className="text-text-secondary leading-relaxed">{message}</p>
        </section>

        {/* Actions */}
        <footer className="flex gap-3 p-6 border-t border-white/10">
          <Button
            onClick={onClose}
            variant="secondary"
            className="flex-1 px-4 py-2.5 bg-white/5 hover:bg-white/10 text-text-primary border-none"
          >
            {cancelText}
          </Button>
          <Button
            onClick={handleConfirm}
            variant={styles.buttonVariant}
            className="flex-1 px-4 py-2.5"
          >
            {confirmText}
          </Button>
        </footer>
      </div>
    </Modal>
  );
};
