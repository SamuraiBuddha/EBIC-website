# Multi-Language Support - Future Feature Specification

## Overview
Add multi-language support to EBIC website targeting Florida market demographics with hybrid GPT-translation + human review workflow.

## Target Languages

### Priority 1 (Initial Release)
1. **Spanish (Latin American - Neutral/Caribbean)**
   - Target: Puerto Rican, Cuban, Venezuelan, Colombian, Dominican, Mexican speakers
   - Dialect: Latin American neutral (NOT Castellano/Spain Spanish)
   - Key differences: "ustedes" not "vosotros", "computadora" not "ordenador"
   - Construction industry terminology with code-switching (keep English acronyms: BIM, VDC, FARO)

2. **Portuguese (Brazilian)**
   - Target: Growing Brazilian community in Central Florida
   - Brazilian Portuguese standard (NOT European Portuguese)
   - Technical terms often borrowed from English

3. **French (Standard)**
   - Target: Haitian community
   - Standard French for professional content

4. **Haitian Creole**
   - Target: Haitian community in Central Florida
   - Local community language

### Priority 2 (Future Expansion)
- Additional languages as market demands

## Translation Workflow - Hybrid Approach

### Phase 1: GPT Translation
1. Extract all text content into JSON structure
2. Provide GPT with translation instructions including:
   - Dialect specifications (Latin American Spanish, Brazilian Portuguese)
   - Technical term handling (keep acronyms, translate descriptions)
   - Construction industry context
   - Tone: Professional, technical, accessible
3. GPT translates entire JSON with context preservation

### Phase 2: Human Review
1. **Spanish**: Human reviewer (Latin American speaker) reviews in website context
2. **Portuguese**: Brazilian friend reviews in website context
3. **French/Creole**: Wife (Haitian native) reviews both languages in website context
4. Review focus: Natural phrasing, technical accuracy, cultural appropriateness

### Phase 3: Context Testing
- Deploy translations to staging environment
- Reviewers test language switching on actual website
- Check all pages: Home, Services, Portfolio, About, Contact
- Verify forms, error messages, dynamic content
- Test navigation and user experience

## Technical Implementation

### Architecture: JavaScript + JSON Approach

**File Structure:**
```
assets/
  js/
    translations.js           # Language switching logic
    language-detector.js      # Browser language detection
  lang/
    en.json                   # English (source)
    es.json                   # Spanish (Latin American)
    pt.json                   # Portuguese (Brazilian)
    fr.json                   # French
    ht.json                   # Haitian Creole
```

**HTML Changes:**
- Add language dropdown to navigation
- Add `data-i18n` attributes to translatable elements
- Add `<html lang="en">` attribute (dynamic per language)

**JavaScript Features:**
- Instant language switching (no page reload)
- localStorage persistence (remember user choice)
- Browser language detection on first visit
- Fallback to English for missing translations

### JSON Structure Example

```json
{
  "nav": {
    "home": "Home",
    "services": "Services",
    "portfolio": "Portfolio",
    "about": "About",
    "contact": "Contact"
  },
  "hero": {
    "title": "Building Information Modeling & Reality Capture",
    "subtitle": "Expert BIM, VDC, and Laser Scanning Services"
  },
  "services": {
    "bim_vdc": {
      "title": "BIM & VDC Services",
      "description": "Comprehensive Building Information Modeling..."
    }
  }
}
```

### SEO Considerations

**Required for Search Engines:**
1. Add `<link rel="alternate" hreflang="es" href="...">` tags
2. Update meta descriptions per language
3. Create sitemap with language variants
4. Consider subdirectory structure: `/es/`, `/pt/`, `/fr/`, `/ht/`
   - OR subdomain: `es.ebic.com` (more complex)
   - OR language parameter: `?lang=es` (simplest but worse SEO)

**Recommended Approach:** Subdirectory structure for better SEO
- Requires server-side rewrite rules or static site generation
- Each language gets own crawlable URLs

## Translation Instructions for GPT

### General Guidelines
- Maintain professional tone throughout
- Keep all technical acronyms in English: BIM, VDC, FARO, LOD, MEP, etc.
- Translate descriptions but preserve brand names and product names
- Construction industry terms should be accessible to both office staff and field workers
- Preserve HTML structure and spacing

### Spanish-Specific Instructions
**Dialect:** Latin American Spanish (neutral, avoiding Spain-specific terms)
- Use "ustedes" NEVER "vosotros"
- Use "computadora" not "ordenador"
- Use "escáner" not "escáner" (accent placement)
- Construction terms: "plomería" or "tubería" (understood broadly)
- Professional register: "usted" form for client-facing content
- Code-switching acceptable: "Servicios de BIM" (keeps acronym)

### Portuguese-Specific Instructions
**Dialect:** Brazilian Portuguese (NOT European)
- Use Brazilian vocabulary and spelling conventions
- Technical terms often borrowed from English
- Professional but accessible tone

### French-Specific Instructions
**Dialect:** Standard French (professional)
- International French, not regional Creole influences
- Professional register appropriate for business clients

### Haitian Creole-Specific Instructions
**Dialect:** Haitian Creole (Kreyòl Ayisyen)
- Community-focused language
- Accessible to working-class speakers
- May keep some technical terms in French/English as commonly used

## Content Extraction Requirements

### Pages to Translate
1. **index.html** - Homepage
2. **pages/services.html** - Services detail
3. **pages/portfolio.html** - Project portfolio
4. **pages/about.html** - About company
5. **pages/contact.html** - Contact form

### Elements to Extract
- Navigation links
- Headings (h1, h2, h3)
- Body paragraphs
- Button text
- Form labels and placeholders
- Alt text for images (where descriptive)
- Meta descriptions and titles

### Elements to SKIP
- Proper nouns: "EBIC", "Ehrig BIM & IT Consultation, Inc."
- Brand names: "FARO", "Revit", "Navisworks", "Dynamo"
- Technical acronyms: "BIM", "VDC", "LOD", "MEP", "CSV"
- Email addresses and phone numbers
- Street addresses (but translate "Avenue", "Street" etc.)
- Project names (unless commonly translated)

## Estimated Effort

### Development Time
- JSON extraction script: 2-3 hours
- Language switching implementation: 3-4 hours
- UI dropdown integration: 1-2 hours
- Testing framework: 2-3 hours
- SEO optimization: 3-4 hours
- **Total Development: ~15-20 hours**

### Translation Time
- GPT translation (all 4 languages): 1-2 hours
- Human review per language: 2-3 hours each
- Context testing: 2-4 hours total
- **Total Translation: ~15-20 hours**

### Cost Estimate
- Development: Internal (already budgeted time)
- GPT API costs: ~$5-10 total (using GPT-4)
- Human review: Trade/favor based (wife, friend)
- **Total Cost: Minimal (~$10 GPT API)**

## Quality Assurance

### Technical QA
- [ ] All pages load in each language
- [ ] Language switcher persists across navigation
- [ ] No broken layout or text overflow
- [ ] Forms work in all languages
- [ ] Error messages display correctly
- [ ] Mobile responsive in all languages

### Content QA (Per Language)
- [ ] Technical accuracy verified by native speaker
- [ ] Natural phrasing (not "machine translation feel")
- [ ] Appropriate professional tone
- [ ] Construction terminology accurate
- [ ] No cultural insensitivity
- [ ] Consistent terminology throughout site

## Launch Strategy

### Soft Launch (Recommended)
1. Deploy to staging environment
2. Share with native-speaking friends/family for feedback
3. Test with small group of bilingual clients
4. Collect feedback and refine
5. Deploy to production with announcement

### Marketing
- Email blast to existing clients: "Now serving clients in Spanish/Portuguese/French/Creole"
- Update Google Business Profile to show language capabilities
- Social media announcement
- Update proposal templates to mention language support

## Future Enhancements

### Phase 2 Features
- Right-to-left language support (Arabic) if market demands
- Language-specific contact forms
- Translated PDF downloads (proposals, case studies)
- Blog content translation
- Video subtitles/captions

### Maintenance
- Update translation files when content changes
- Annual review of terminology with native speakers
- Track which languages are most used (analytics)
- Add languages based on demand

## Success Metrics

### Quantitative
- % of visitors using non-English languages
- Conversion rate by language
- Time on site by language
- Form submissions by language
- SEO ranking in different language searches

### Qualitative
- Client feedback on language quality
- Reduced language barrier in initial contact
- Improved communication with non-English clients
- Market reach expansion

## Notes & Considerations

### Florida Market Context
- ~25% of Florida speaks Spanish at home
- Central Florida has significant Puerto Rican population (Orlando metro)
- Growing Brazilian community in Winter Springs/Lake Mary area
- Haitian community strong in Central Florida
- Construction industry workforce highly multilingual

### Competitive Advantage
- Few AEC consulting firms offer multilingual support
- Demonstrates cultural competency
- Reduces barrier to entry for non-English clients
- Positions EBIC as inclusive, accessible firm

### Risk Mitigation
- Human review prevents embarrassing translation errors
- Staging environment allows testing before public launch
- Rollback plan: Easy to revert to English-only if issues arise
- Incremental approach: Can launch one language at a time

## Implementation Checklist

### Prerequisites
- [ ] Finalize content on all pages (minimize post-translation edits)
- [ ] Confirm human reviewers available for each language
- [ ] Test GPT-4 translation quality with sample content

### Development Phase
- [ ] Create JSON extraction script
- [ ] Build language switching system
- [ ] Design and implement dropdown UI
- [ ] Add localStorage persistence
- [ ] Implement SEO tags (hreflang)

### Translation Phase
- [ ] Extract all content to JSON files
- [ ] Prepare translation instructions for GPT
- [ ] Run GPT translations (all 4 languages)
- [ ] Spanish human review
- [ ] Portuguese human review
- [ ] French human review
- [ ] Haitian Creole human review

### Testing Phase
- [ ] Deploy to staging environment
- [ ] Technical QA (all pages, all languages)
- [ ] Content QA with reviewers
- [ ] Mobile testing
- [ ] Browser compatibility testing
- [ ] Performance testing (load times)

### Launch Phase
- [ ] Production deployment
- [ ] Analytics setup (track language usage)
- [ ] Marketing announcement
- [ ] Monitor for issues
- [ ] Collect user feedback

## Contact Information for Implementation

**Human Reviewers:**
- Spanish: [Friend contact - TBD]
- Portuguese: Brazilian friend - [Contact TBD]
- French/Creole: Wife (Haitian native speaker)

**Technical Implementation:**
- Developer: Jordan Ehrig
- Timeline: TBD (future enhancement)
- Priority: Medium (after core website refinement)

---

**Document Version:** 1.0
**Created:** 2025-01-29
**Last Updated:** 2025-01-29
**Status:** Specification Complete - Awaiting Implementation Scheduling
