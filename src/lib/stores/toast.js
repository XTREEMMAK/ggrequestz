import { writable } from 'svelte/store';

function createToastStore() {
  const { subscribe, update } = writable([]);
  
  let nextId = 0;
  
  const addToast = (message, type = 'info', duration = 3000) => {
    const id = nextId++;
    const toast = { id, message, type, duration };
    
    update(toasts => [...toasts, toast]);
    
    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }
    
    return id;
  };
  
  const removeToast = (id) => {
    update(toasts => toasts.filter(t => t.id !== id));
  };
  
  const success = (message, duration) => addToast(message, 'success', duration);
  const error = (message, duration) => addToast(message, 'error', duration);
  const info = (message, duration) => addToast(message, 'info', duration);
  const warning = (message, duration) => addToast(message, 'warning', duration);
  
  return {
    subscribe,
    add: addToast,
    remove: removeToast,
    success,
    error,
    info,
    warning,
    clear: () => update(() => [])
  };
}

export const toasts = createToastStore();