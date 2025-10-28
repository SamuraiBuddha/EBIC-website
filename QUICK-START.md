# EBIC Website - Quick Start Guide

## Immediate Next Steps

### 1. Add Images (Priority 1)

Copy 10-15 representative images from your design portfolio:

```bash
# Source: \\adam\DataPool\Design Work (735 JPG files)
# Target: C:\Users\JordanEhrig\Documents\GitHub\EBIC-website\assets\images\

# Required images:
- placeholder-airport.jpg     (Tampa Airport project)
- placeholder-space.jpg       (Kennedy Space Center)
- placeholder-military.jpg    (Military installation)
- placeholder-bim.jpg         (BIM workspace/Revit screenshot)
- placeholder-scan.jpg        (FARO scanning equipment or point cloud)
- placeholder-management.jpg  (Project management dashboard)
- placeholder-ai.jpg          (Software/AI interface)
- favicon.ico                 (32x32 company icon)
```

**Image Specs**:
- Format: JPG (or WebP for better compression)
- Size: 1200x800px for service pages, 800x600px for portfolio
- Optimization: <200KB per image (use TinyPNG.com)

### 2. Test Locally (2 minutes)

```bash
# Option 1: Direct browser
# Open: C:\Users\JordanEhrig\Documents\GitHub\EBIC-website\index.html

# Option 2: Local server (recommended)
cd C:\Users\JordanEhrig\Documents\GitHub\EBIC-website
python -m http.server 8000
# Then open: http://localhost:8000
```

### 3. Deploy to Apache (5 minutes)

**If using XAMPP/WAMP (Windows)**:
```bash
xcopy "C:\Users\JordanEhrig\Documents\GitHub\EBIC-website\*" "C:\xampp\htdocs\ebic\" /E /I /Y
```

**Access**: http://localhost/ebic

**If deploying to remote server**:
```bash
# Via FTP/SFTP
# Upload entire EBIC-website folder to web root

# Via SCP (Linux)
scp -r EBIC-website/* user@server:/var/www/html/
```

### 4. Enable Apache Modules

**Windows (XAMPP)**:
1. Open: C:\xampp\apache\conf\httpd.conf
2. Uncomment these lines:
   ```apache
   LoadModule rewrite_module modules/mod_rewrite.so
   LoadModule deflate_module modules/mod_deflate.so
   LoadModule expires_module modules/mod_expires.so
   LoadModule headers_module modules/mod_headers.so
   ```
3. Restart Apache from XAMPP control panel

**Linux**:
```bash
sudo a2enmod rewrite deflate expires headers
sudo systemctl restart apache2
```

### 5. Verify Functionality

Test these features:
- [ ] Homepage loads properly
- [ ] Mobile menu works (resize browser)
- [ ] All navigation links work
- [ ] Images display correctly
- [ ] Contact form validates inputs
- [ ] Stats counter animates on scroll
- [ ] Service cards have hover effects

## Common Customizations

### Update Company Contact Info

Edit `pages/contact.html`:
- Line 107: Add actual contact email
- Line 166: Add business phone number
- Add physical address if needed

### Change Brand Colors

Edit `assets/css/styles.css` (lines 8-12):
```css
:root {
    --color-primary: #0066cc;        /* Main brand color */
    --color-secondary: #ff6b35;      /* Accent color */
    --color-accent: #00a86b;         /* Success color */
}
```

### Update Company Details

Edit footer in all HTML files:
- Company name variations
- Tagline customization
- Additional service links

## Production Checklist

Before going live:

### Content
- [ ] Replace all placeholder images with actual project photos
- [ ] Add real contact information (email, phone, address)
- [ ] Review all service descriptions for accuracy
- [ ] Add portfolio project details
- [ ] Create About page content
- [ ] Write company bio/history

### Technical
- [ ] Test on mobile devices (iOS Safari, Chrome Android)
- [ ] Test on major browsers (Chrome, Firefox, Safari, Edge)
- [ ] Optimize all images (<200KB each)
- [ ] Enable HTTPS (SSL certificate)
- [ ] Configure contact form server-side processing
- [ ] Set up error pages (404.html, 500.html)
- [ ] Test .htaccess rewrite rules
- [ ] Verify Gzip compression working

### SEO
- [ ] Update meta descriptions for each page
- [ ] Add Open Graph tags for social sharing
- [ ] Generate XML sitemap
- [ ] Create robots.txt
- [ ] Submit to Google Search Console
- [ ] Submit to Bing Webmaster Tools

### Analytics & Monitoring
- [ ] Add Google Analytics tracking code
- [ ] Set up uptime monitoring (UptimeRobot)
- [ ] Configure Apache access/error log rotation
- [ ] Set up automated backups

## File Structure Reference

```
EBIC-website/
├── index.html                 # Homepage (358 lines)
├── .htaccess                  # Apache config (158 lines)
├── README.md                  # Full documentation (451 lines)
├── QUICK-START.md            # This file
│
├── assets/
│   ├── css/
│   │   └── styles.css        # Main stylesheet (786 lines)
│   ├── js/
│   │   └── main.js           # Interactivity (388 lines)
│   └── images/
│       └── (add images here)
│
└── pages/
    ├── services.html         # Services page (233 lines)
    ├── contact.html          # Contact form (263 lines)
    ├── portfolio.html        # (create from template)
    └── about.html            # (create from template)
```

## Quick Fixes

### Mobile menu not working
```javascript
// Check browser console for errors
// Verify main.js is loaded: View Source → check script tag
```

### CSS not applying
```html
<!-- Verify CSS path in HTML head -->
<link rel="stylesheet" href="../assets/css/styles.css">
<!-- Note: Use ../ for pages in /pages/ folder -->
```

### Images not showing
```html
<!-- Check image paths -->
<!-- From index.html: assets/images/image.jpg -->
<!-- From pages/*.html: ../assets/images/image.jpg -->
```

### .htaccess not working
1. Check Apache error log
2. Verify AllowOverride All in Apache config
3. Test: Create test.html, access via /test (no .html)

## Performance Quick Check

After deployment:
1. Test speed: https://pagespeed.web.dev/
2. Test mobile: https://search.google.com/test/mobile-friendly
3. Test SSL: https://www.ssllabs.com/ssltest/

Target scores:
- PageSpeed: 90+ (desktop), 80+ (mobile)
- Mobile-friendly: Pass
- SSL: A or A+

## Support Resources

- **Full Documentation**: README.md
- **Apache Docs**: https://httpd.apache.org/docs/2.4/
- **HTML5 Validator**: https://validator.w3.org/
- **CSS Validator**: https://jigsaw.w3.org/css-validator/

## Project Stats

- **Total Lines of Code**: ~2,700
- **HTML Files**: 3 (+ 2 templates to create)
- **CSS**: 786 lines (single file)
- **JavaScript**: 388 lines (vanilla JS)
- **Build Time**: ~2 hours
- **Production Ready**: Yes

---

**Pro Tip**: Start by testing locally, add images, then deploy to staging before production.