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
export function extractImagesFromHtml(html: string): Array<{src: string, alt?: string}> {
  const images: Array<{src: string, alt?: string}> = [];
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
