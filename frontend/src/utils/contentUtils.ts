/**
 * Content utility functions for handling rich text and formatting conversions
 */

/**
 * Extract plain text from HTML content
 */
export function htmlToText(html: string): string {
  const temp = document.createElement('div');
  temp.innerHTML = html;
  return temp.textContent || temp.innerText || '';
}

/**
 * Convert HTML to plain text while preserving paragraph structure and line breaks
 * This is specifically for converting TipTap editor HTML back to plain text for storage
 * IMPORTANT: Preserves images by converting HTML <img> tags back to markdown ![alt](url) syntax
 */
export function htmlToPlainText(html: string): string {
  if (!html) return '';

  // If already plain text (no HTML tags), return as is
  if (!html.includes('<')) {
    return html;
  }

  // CRITICAL FIX: Convert <img> tags back to markdown syntax BEFORE other HTML processing
  // This preserves images in greetings and other text fields
  html = html.replace(/<img\s+([^>]*?)\s*\/?>/gi, (_match, attrs) => {
    // Extract src and alt attributes
    const srcMatch = attrs.match(/src=["']([^"']*)["']/i);
    const altMatch = attrs.match(/alt=["']([^"']*)["']/i);

    const src = srcMatch ? srcMatch[1] : '';
    const alt = altMatch ? altMatch[1] : '';

    if (src) {
      // Convert to markdown image syntax
      return `![${alt}](${src})`;
    }
    return '';
  });

  const temp = document.createElement('div');
  temp.innerHTML = html;

  // Replace <p> tags with double newlines (paragraph breaks)
  // Replace <br> tags with single newlines
  let text = html
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')  // Paragraph breaks (with optional whitespace)
    .replace(/<p[^>]*>/gi, '')            // Opening <p> tags
    .replace(/<\/p>/gi, '')                // Closing </p> tags
    .replace(/<br\s*\/?>/gi, '\n')        // <br> tags
    .replace(/<\/div>\s*<div[^>]*>/gi, '\n') // <div> breaks (with optional whitespace)
    .replace(/<div[^>]*>/gi, '')          // Opening <div> tags
    .replace(/<\/div>/gi, '');            // Closing </div> tags

  // Use a temporary div to decode HTML entities and strip remaining tags
  temp.innerHTML = text;
  text = temp.textContent || temp.innerText || '';

  // Don't trim or collapse newlines - preserve exact structure for proper round-trip conversion
  return text;
}

/**
 * Convert markdown image syntax to HTML
 */
export function markdownToHtml(markdown: string): string {
  if (!markdown) return '';

  // Convert markdown image syntax ![alt](url) to HTML <img src="url" alt="alt">
  return markdown.replace(/!\[(.*?)\]\((.*?)\)/g, '<img src="$2" alt="$1">');
}

/**
 * Convert plain text with newlines to proper HTML paragraph structure
 */
export function textToHtmlParagraphs(text: string): string {
  if (!text) return '';

  // If text already contains HTML tags, return as is
  if (text.includes('<p>') || text.includes('<br>') || text.includes('<div>')) {
    return text;
  }

  // Split by double newlines to create paragraphs
  const paragraphs = text.split(/\n\s*\n/);

  // Convert each paragraph, handling single newlines within paragraphs
  const htmlParagraphs = paragraphs
    .map(paragraph => {
      const trimmedParagraph = paragraph.trim();
      if (!trimmedParagraph) return '';

      // Convert single newlines within paragraphs to <br> tags
      const paragraphWithBreaks = trimmedParagraph.replace(/\n/g, '<br>');
      return `<p>${paragraphWithBreaks}</p>`;
    })
    .filter(p => p)
    .join('');

  return htmlParagraphs || `<p>${text}</p>`;
}

/**
 * Converts markdown image syntax ![alt](url) to HTML <img> tags
 * Used specifically for handling images in messages
 */
export const convertMarkdownImagesToHtml = (content: string): string => {
  // Match markdown image syntax ![alt](url)
  const imageRegex = /!\[(.*?)\]\((.*?)\)/g;

  return content.replace(imageRegex, (_matchStr, alt, url) => {
    // Clean the URL and alt text
    const cleanUrl = url.trim();
    const cleanAlt = alt.trim();

    // Create an HTML img tag with proper attributes
    return `<img src="${cleanUrl}" alt="${cleanAlt}" class="chat-image" />`;
  });
};

/**
 * Extract image URLs from HTML content
 */
export function extractImagesFromHtml(html: string): Array<{ src: string, alt?: string }> {
  const images: Array<{ src: string, alt?: string }> = [];
  const temp = document.createElement('div');
  temp.innerHTML = html;

  const imgElements = temp.querySelectorAll('img');
  imgElements.forEach(img => {
    const src = img.getAttribute('src');
    const alt = img.getAttribute('alt');

    if (src) {
      images.push({
        src,
        alt: alt || undefined
      });
    }
  });

  return images;
}

/**
 * Sanitize HTML content for security
 */
export function sanitizeHtml(html: string): string {
  const temp = document.createElement('div');
  temp.innerHTML = html;

  // Remove potentially dangerous elements and attributes
  const scripts = temp.querySelectorAll('script');
  scripts.forEach(script => script.remove());

  const elements = temp.querySelectorAll('*');
  elements.forEach(el => {
    // Remove event handler attributes
    Array.from(el.attributes).forEach(attr => {
      if (attr.name.startsWith('on')) {
        el.removeAttribute(attr.name);
      }
    });

    // Remove javascript: URLs
    if (el.hasAttribute('href')) {
      const href = el.getAttribute('href');
      if (href && href.toLowerCase().startsWith('javascript:')) {
        el.setAttribute('href', '#');
      }
    }
  });

  return temp.innerHTML;
}
