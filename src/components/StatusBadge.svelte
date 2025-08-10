<!--
  Status indicator badge component with color-coded styling
-->

<script>
  let { status = 'pending', size = 'sm' } = $props(); // 'xs', 'sm', 'md', 'lg'
  
  let statusClass = $derived(getStatusClass(status));
  let sizeClass = $derived(getSizeClass(size));
  
  function getStatusClass(status) {
    const statusMap = {
      'new': 'status-new',
      'requested': 'status-requested', 
      'popular': 'status-popular',
      'fulfilled': 'status-fulfilled',
      'pending': 'status-pending',
      'approved': 'status-approved'
    };
    
    return statusMap[status.toLowerCase()] || 'status-pending';
  }
  
  function getSizeClass(size) {
    const sizeMap = {
      'xs': 'px-1.5 py-0.5 text-xs',
      'sm': 'px-2 py-1 text-xs', 
      'md': 'px-2.5 py-1.5 text-sm',
      'lg': 'px-3 py-2 text-base'
    };
    
    return sizeMap[size] || sizeMap.sm;
  }
  
  function formatStatus(status) {
    return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
  }
</script>

<span 
  class="inline-flex items-center font-medium rounded-full border {statusClass} {sizeClass}"
  role="status"
  aria-label="Status: {formatStatus(status)}"
>
  {formatStatus(status)}
</span>