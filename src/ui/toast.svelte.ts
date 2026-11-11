/** App-wide toast: any screen calls showToast(); App renders one <Toast> bound to this. */
export const toasts = $state({ message: '' });

export function showToast(message: string): void {
  toasts.message = message;
}

export function clearToast(): void {
  toasts.message = '';
}
