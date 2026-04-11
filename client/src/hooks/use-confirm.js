import Swal from 'sweetalert2';

export function useConfirm() {
  const confirm = async ({ title, text, confirmText = 'Ja, fortfahren', cancelText = 'Abbrechen', icon = 'warning' }) => {
    const result = await Swal.fire({
      title,
      text,
      icon,
      showCancelButton: true,
      confirmButtonText: confirmText,
      cancelButtonText: cancelText,
      confirmButtonColor: 'hsl(var(--primary))',
      cancelButtonColor: 'hsl(var(--muted))',
      reverseButtons: true,
    });
    return result.isConfirmed;
  };

  return { confirm };
}
