export class NotificationManager {
  private static instance: NotificationManager;
  private container: HTMLDivElement;

  private constructor() {
    this.container = document.createElement('div');
    this.container.id = 'notification-container';
    document.body.appendChild(this.container);
  }

  static getInstance(): NotificationManager {
    if (!this.instance) this.instance = new NotificationManager();
    return this.instance;
  }

  show(message: string, type: 'success' | 'error' | 'info' = 'info', duration = 3000) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    
    this.container.appendChild(toast);
    
    // Trigger reflow for animation
    setTimeout(() => {
      toast.classList.add('toast-show');
    }, 10);
    
    // Auto remove
    setTimeout(() => {
      toast.classList.remove('toast-show');
      toast.classList.add('toast-fade-out');
      setTimeout(() => {
        toast.remove();
      }, 300); // Wait for transition
    }, duration);
  }
}
