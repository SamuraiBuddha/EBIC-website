/**
 * EBIC Website - Main JavaScript
 * Vanilla JavaScript for performance and compatibility
 */

(function() {
    'use strict';

    // Configuration
    const config = {
        mobileBreakpoint: 768,
        scrollThreshold: 100,
        animationDuration: 600,
        statsAnimationSpeed: 50
    };

    // Utility Functions
    const utils = {
        // Debounce function for performance
        debounce: function(func, wait) {
            let timeout;
            return function executedFunction(...args) {
                const later = () => {
                    clearTimeout(timeout);
                    func(...args);
                };
                clearTimeout(timeout);
                timeout = setTimeout(later, wait);
            };
        },

        // Check if element is in viewport
        isInViewport: function(element) {
            const rect = element.getBoundingClientRect();
            return (
                rect.top >= 0 &&
                rect.left >= 0 &&
                rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
                rect.right <= (window.innerWidth || document.documentElement.clientWidth)
            );
        },

        // Smooth scroll to element
        smoothScroll: function(target) {
            const element = document.querySelector(target);
            if (element) {
                element.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        }
    };

    // Mobile Menu Handler
    const mobileMenu = {
        toggle: null,
        nav: null,
        isOpen: false,

        init: function() {
            this.toggle = document.querySelector('.mobile-menu-toggle');
            this.nav = document.querySelector('.nav-links');

            if (this.toggle && this.nav) {
                this.toggle.addEventListener('click', this.toggleMenu.bind(this));
                
                // Close menu when clicking nav links
                const navLinks = this.nav.querySelectorAll('.nav-link');
                navLinks.forEach(link => {
                    link.addEventListener('click', () => {
                        if (this.isOpen) {
                            this.toggleMenu();
                        }
                    });
                });

                // Close menu on window resize to desktop
                window.addEventListener('resize', utils.debounce(() => {
                    if (window.innerWidth >= config.mobileBreakpoint && this.isOpen) {
                        this.toggleMenu();
                    }
                }, 250));
            }
        },

        toggleMenu: function() {
            this.isOpen = !this.isOpen;
            this.toggle.setAttribute('aria-expanded', this.isOpen);
            
            if (this.isOpen) {
                this.nav.style.display = 'flex';
                this.nav.style.flexDirection = 'column';
                this.nav.style.position = 'absolute';
                this.nav.style.top = 'var(--header-height)';
                this.nav.style.left = '0';
                this.nav.style.width = '100%';
                this.nav.style.background = 'white';
                this.nav.style.padding = '1rem';
                this.nav.style.boxShadow = 'var(--shadow-lg)';
                document.body.style.overflow = 'hidden';
            } else {
                this.nav.style.display = '';
                this.nav.style.flexDirection = '';
                this.nav.style.position = '';
                this.nav.style.top = '';
                this.nav.style.left = '';
                this.nav.style.width = '';
                this.nav.style.background = '';
                this.nav.style.padding = '';
                this.nav.style.boxShadow = '';
                document.body.style.overflow = '';
            }
        }
    };

    // Header Scroll Effects
    const headerScroll = {
        header: null,
        lastScroll: 0,

        init: function() {
            this.header = document.querySelector('.site-header');
            if (this.header) {
                window.addEventListener('scroll', utils.debounce(this.handleScroll.bind(this), 10));
            }
        },

        handleScroll: function() {
            const currentScroll = window.pageYOffset;

            // Add shadow on scroll
            if (currentScroll > config.scrollThreshold) {
                this.header.style.boxShadow = 'var(--shadow-md)';
            } else {
                this.header.style.boxShadow = 'var(--shadow-sm)';
            }

            this.lastScroll = currentScroll;
        }
    };

    // Animated Counter for Stats
    const statsCounter = {
        animated: false,
        counters: [],

        init: function() {
            this.counters = document.querySelectorAll('.stat-number');
            if (this.counters.length > 0) {
                window.addEventListener('scroll', utils.debounce(this.checkPosition.bind(this), 100));
                this.checkPosition(); // Check on load
            }
        },

        checkPosition: function() {
            if (this.animated) return;

            const statsSection = document.querySelector('.stats-section');
            if (statsSection && utils.isInViewport(statsSection)) {
                this.animate();
                this.animated = true;
            }
        },

        animate: function() {
            this.counters.forEach(counter => {
                const target = parseInt(counter.getAttribute('data-target'));
                const increment = target / (config.animationDuration / config.statsAnimationSpeed);
                let current = 0;

                const updateCounter = () => {
                    current += increment;
                    if (current < target) {
                        counter.textContent = Math.floor(current);
                        setTimeout(updateCounter, config.statsAnimationSpeed);
                    } else {
                        counter.textContent = target;
                    }
                };

                updateCounter();
            });
        }
    };

    // Scroll Reveal Animation
    const scrollReveal = {
        elements: [],

        init: function() {
            this.elements = document.querySelectorAll('.service-card, .project-card, .sector-card, .tech-category');
            if (this.elements.length > 0) {
                this.elements.forEach(el => {
                    el.style.opacity = '0';
                    el.style.transform = 'translateY(30px)';
                    el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
                });

                window.addEventListener('scroll', utils.debounce(this.reveal.bind(this), 100));
                this.reveal(); // Check on load
            }
        },

        reveal: function() {
            this.elements.forEach(element => {
                if (element.style.opacity === '1') return; // Already revealed

                const rect = element.getBoundingClientRect();
                const isVisible = rect.top < window.innerHeight * 0.85;

                if (isVisible) {
                    element.style.opacity = '1';
                    element.style.transform = 'translateY(0)';
                }
            });
        }
    };

    // Smooth Scroll for Anchor Links
    const smoothScrollLinks = {
        init: function() {
            const anchorLinks = document.querySelectorAll('a[href^="#"]');
            anchorLinks.forEach(link => {
                link.addEventListener('click', function(e) {
                    const href = this.getAttribute('href');
                    if (href !== '#' && href.length > 1) {
                        e.preventDefault();
                        utils.smoothScroll(href);
                    }
                });
            });
        }
    };

    // Form Validation (for contact page)
    const formValidation = {
        init: function() {
            const forms = document.querySelectorAll('form[data-validate]');
            forms.forEach(form => {
                form.addEventListener('submit', this.handleSubmit.bind(this));
            });
        },

        handleSubmit: function(e) {
            const form = e.target;
            const inputs = form.querySelectorAll('input[required], textarea[required]');
            let isValid = true;

            inputs.forEach(input => {
                if (!input.value.trim()) {
                    isValid = false;
                    this.showError(input, 'This field is required');
                } else if (input.type === 'email' && !this.isValidEmail(input.value)) {
                    isValid = false;
                    this.showError(input, 'Please enter a valid email address');
                } else {
                    this.clearError(input);
                }
            });

            if (!isValid) {
                e.preventDefault();
            }
        },

        isValidEmail: function(email) {
            const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            return re.test(email);
        },

        showError: function(input, message) {
            this.clearError(input);
            const error = document.createElement('span');
            error.className = 'error-message';
            error.textContent = message;
            error.style.color = 'var(--color-secondary)';
            error.style.fontSize = 'var(--font-size-sm)';
            error.style.display = 'block';
            error.style.marginTop = 'var(--space-1)';
            input.parentNode.appendChild(error);
            input.style.borderColor = 'var(--color-secondary)';
        },

        clearError: function(input) {
            const error = input.parentNode.querySelector('.error-message');
            if (error) {
                error.remove();
            }
            input.style.borderColor = '';
        }
    };

    // Lazy Loading Images
    const lazyLoad = {
        images: [],

        init: function() {
            this.images = document.querySelectorAll('img[loading="lazy"]');
            
            if ('IntersectionObserver' in window) {
                const imageObserver = new IntersectionObserver((entries) => {
                    entries.forEach(entry => {
                        if (entry.isIntersecting) {
                            const img = entry.target;
                            img.src = img.dataset.src || img.src;
                            img.classList.add('loaded');
                            imageObserver.unobserve(img);
                        }
                    });
                });

                this.images.forEach(img => imageObserver.observe(img));
            }
        }
    };

    // Performance Monitoring
    const performance = {
        init: function() {
            if ('performance' in window) {
                window.addEventListener('load', () => {
                    const perfData = window.performance.timing;
                    const pageLoadTime = perfData.loadEventEnd - perfData.navigationStart;
                    console.log(`Page load time: ${pageLoadTime}ms`);
                });
            }
        }
    };

    // Accessibility Enhancements
    const accessibility = {
        init: function() {
            // Focus visible for keyboard navigation
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Tab') {
                    document.body.classList.add('keyboard-nav');
                }
            });

            document.addEventListener('mousedown', () => {
                document.body.classList.remove('keyboard-nav');
            });

            // Add focus styles
            const style = document.createElement('style');
            style.textContent = `
                .keyboard-nav *:focus {
                    outline: 2px solid var(--color-primary);
                    outline-offset: 2px;
                }
            `;
            document.head.appendChild(style);
        }
    };

    // Initialize all modules when DOM is ready
    function init() {
        // Check if DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initModules);
        } else {
            initModules();
        }
    }

    function initModules() {
        console.log('EBIC Website initialized');
        
        // Initialize all modules
        mobileMenu.init();
        headerScroll.init();
        statsCounter.init();
        scrollReveal.init();
        smoothScrollLinks.init();
        formValidation.init();
        lazyLoad.init();
        accessibility.init();
        
        if (window.location.hostname !== 'localhost') {
            performance.init();
        }
    }

    // Start initialization
    init();

})();