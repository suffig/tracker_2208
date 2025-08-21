// Mobile menu toggle functionality to replace Flowbite
document.addEventListener('DOMContentLoaded', function() {
    // Mobile menu toggle
    const toggleButton = document.querySelector('[data-collapse-toggle]');
    const targetId = toggleButton?.getAttribute('data-collapse-toggle');
    const targetMenu = targetId ? document.getElementById(targetId) : null;
    
    if (toggleButton && targetMenu) {
        toggleButton.addEventListener('click', function() {
            const isExpanded = this.getAttribute('aria-expanded') === 'true';
            
            // Toggle menu visibility
            if (isExpanded) {
                targetMenu.classList.remove('show');
                this.setAttribute('aria-expanded', 'false');
            } else {
                targetMenu.classList.add('show');
                this.setAttribute('aria-expanded', 'true');
            }
        });
    }
    
    // Close mobile menu when clicking outside
    document.addEventListener('click', function(event) {
        if (toggleButton && targetMenu && 
            !toggleButton.contains(event.target) && 
            !targetMenu.contains(event.target)) {
            targetMenu.classList.remove('show');
            toggleButton.setAttribute('aria-expanded', 'false');
        }
    });
});