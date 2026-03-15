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
      <div className="flex h-full flex-col">
        <header className="flex items-start justify-between border-b border-border/70 p-6">
          <div className="flex items-center gap-3">
            <span className="surface-base inline-flex rounded-2xl p-2.5">
              <DangerTriangle
                className={`${styles.iconColor} shrink-0`}
                size={24}
                aria-hidden="true"
              />
            </span>
            <h2 className="text-xl font-bold text-text-primary">{title}</h2>
          </div>
          <Button
            onClick={onClose}
            variant="ghost"
            size="icon"
            className="-mr-2 -mt-2 text-text-secondary hover:text-text-primary"
            aria-label="Fechar diálogo"
          >
            <CloseCircle size={20} />
          </Button>
        </header>

        <section className="p-6">
          <p className="text-text-secondary leading-relaxed">{message}</p>
        </section>

        <footer className="flex gap-3 border-t border-border/70 p-6">
          <Button onClick={onClose} variant="secondary" className="flex-1 px-4 py-2.5">
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
