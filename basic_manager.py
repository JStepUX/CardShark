import os
import ssl
import urllib.request
from tkinter import filedialog, messagebox
import tkinter as tk
from tkinter import ttk
from constants import *
from text_manager import text_manager

class BasicManager:
    def __init__(self, parent_frame, text_config, logger):
        """Initialize Basic Manager with required UI elements and logger."""
        self.parent_frame = parent_frame
        self.text_config = text_config
        self.logger = logger
        
        # Configure styles
        self.style = ttk.Style()
        self.style.configure(
            'Basic.TLabel',
            font=FONTS['DEFAULT']  # Using our 14px font
        )
        self.style.configure(
            'Basic.TEntry',
            font=FONTS['DEFAULT']  # Using our 14px font
        )
        
        # Create container for fields
        self.fields_container = ttk.Frame(self.parent_frame)
        self.fields_container.pack(fill=tk.BOTH, expand=True, padx=10, pady=5)
        
        self.create_fields()
        
    def create_fields(self):
        """Create all basic info fields."""
        # Character Name
        name_frame = ttk.Frame(self.fields_container)
        name_frame.pack(fill=tk.X, pady=(0, 5))
        ttk.Label(
            name_frame,
            text="Character Name:",
            style='Basic.TLabel'
        ).pack(side=tk.LEFT)
        self.char_name_entry = ttk.Entry(
            name_frame,
            font=FONTS['DEFAULT']  # Direct font application for entry
        )
        self.char_name_entry.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(5, 0))
        
        # Display Name
        display_name_frame = ttk.Frame(self.fields_container)
        display_name_frame.pack(fill=tk.X, pady=5)
        ttk.Label(
            display_name_frame,
            text="Character Display Name:",
            style='Basic.TLabel'
        ).pack(side=tk.LEFT)
        self.display_name_entry = ttk.Entry(
            display_name_frame,
            font=FONTS['DEFAULT']  # Direct font application for entry
        )
        self.display_name_entry.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(5, 0))
        
        # Tags
        tags_frame = ttk.Frame(self.fields_container)
        tags_frame.pack(fill=tk.BOTH, expand=True, pady=5)
        ttk.Label(
            tags_frame,
            text="Tags:",
            style='Basic.TLabel'
        ).pack(anchor=tk.W)
        self.tags_text = text_manager.create_text_widget(
            tags_frame,
            height=4  # Only specify what's different from defaults
        )
        self.tags_text.pack(fill=tk.BOTH, expand=True)
        
        # Imported Images
        images_frame = ttk.Frame(self.fields_container)
        images_frame.pack(fill=tk.BOTH, expand=True, pady=5)
        ttk.Label(
            images_frame,
            text="Imported Images:",
            style='Basic.TLabel'
        ).pack(anchor=tk.W)
        self.images_text = text_manager.create_text_widget(
            images_frame,
            height=4,
        )
        self.images_text.pack(fill=tk.BOTH, expand=True)

        # Download button below the text area
        self.download_button = ttk.Button(
            images_frame,
            text="Download All",
            command=self.download_all_images,
            bootstyle="secondary-outline",
            width=12
        )
        self.download_button.pack(pady=(5, 0))  # Add padding above button

    def update_fields(self, json_data):
        """Update fields from JSON data."""
        try:
            # Clear existing fields
            self.char_name_entry.delete(0, tk.END)
            self.display_name_entry.delete(0, tk.END)
            self.tags_text.delete('1.0', tk.END)
            self.images_text.delete('1.0', tk.END)
            
            if json_data.get('spec') == 'chara_card_v2':
                char_data = json_data.get('data', {})
                
                # Update name fields
                self.char_name_entry.insert(0, char_data.get('name', ''))
                self.display_name_entry.insert(0, char_data.get('display_name', ''))
                
                # Update tags
                tags = char_data.get('tags', [])
                if isinstance(tags, list):
                    self.tags_text.insert('1.0', '\n'.join(tags))
                
                # Update imported images
                images = char_data.get('imported_images', [])
                if isinstance(images, list):
                    self.images_text.insert('1.0', '\n'.join(images))
                
        except Exception as e:
            self.logger.log_step(f"Error updating basic info fields: {str(e)}")
            raise

    def get_field_data(self):
        """Get data from all fields."""
        try:
            # Get tags as list (split by newlines and remove empty strings)
            tags = [tag.strip() for tag in self.tags_text.get('1.0', 'end-1c').split('\n') if tag.strip()]
            
            # Get images as list
            images = [img.strip() for img in self.images_text.get('1.0', 'end-1c').split('\n') if img.strip()]
            
            return {
                'name': self.char_name_entry.get().strip(),
                'display_name': self.display_name_entry.get().strip(),
                'tags': tags,
                'imported_images': images
            }
            
        except Exception as e:
            self.logger.log_step(f"Error getting basic info data: {str(e)}")
            raise

    # Download method:
    def download_all_images(self):
        """Download all images from the imported_images URLs."""
        try:
            # Get URLs from text widget
            urls_text = self.images_text.get('1.0', 'end-1c')
            if not urls_text.strip():
                messagebox.showwarning("No Images", "No image URLs found to download.")
                return
                
            # Get list of URLs
            urls = [url.strip() for url in urls_text.split('\n') if url.strip()]
            
            if not urls:
                messagebox.showwarning("No Images", "No valid image URLs found.")
                return
                
            # Ask user for destination directory
            dest_dir = filedialog.askdirectory(
                title="Select Download Location",
                initialdir=os.path.expanduser("~")
            )
            
            if not dest_dir:
                return  # User cancelled
                
            self.logger.log_step(f"Starting download of {len(urls)} images to {dest_dir}")
            
            # Create progress dialog
            progress = tk.Toplevel()
            progress.title("Downloading Images")
            progress.transient()
            progress.grab_set()
            
            # Center the dialog
            window_width = 300
            window_height = 150
            screen_width = progress.winfo_screenwidth()
            screen_height = progress.winfo_screenheight()
            center_x = int(screen_width/2 - window_width/2)
            center_y = int(screen_height/2 - window_height/2)
            progress.geometry(f'{window_width}x{window_height}+{center_x}+{center_y}')
            
            # Progress message
            message_var = tk.StringVar(value="Preparing downloads...")
            ttk.Label(
                progress,
                textvariable=message_var
            ).pack(pady=10)
            
            # Progress bar
            progress_var = tk.DoubleVar()
            progress_bar = ttk.Progressbar(
                progress,
                variable=progress_var,
                maximum=len(urls)
            )
            progress_bar.pack(fill=tk.X, padx=20, pady=10)
            
            # Download counter
            count_var = tk.StringVar(value="0 / " + str(len(urls)))
            ttk.Label(
                progress,
                textvariable=count_var
            ).pack(pady=5)
            
            success_count = 0
            failed_urls = []
            
            # Process each URL
            for idx, url in enumerate(urls, 1):
                try:
                    message_var.set(f"Downloading image {idx} of {len(urls)}")
                    count_var.set(f"{idx-1} / {len(urls)}")
                    progress_var.set(idx-1)
                    progress.update()
                    
                    # Create filename from URL
                    filename = os.path.join(dest_dir, f"image_{idx}.jpg")
                    
                    # Download the image
                    headers = {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    }
                    request = urllib.request.Request(url, headers=headers)
                    
                    # Use SSL context from url_handler if available
                    ssl_context = self.get_ssl_context()
                    
                    with urllib.request.urlopen(request, context=ssl_context) as response:
                        image_data = response.read()
                        
                    # Save the image
                    with open(filename, 'wb') as f:
                        f.write(image_data)
                        
                    success_count += 1
                        
                except Exception as e:
                    self.logger.log_step(f"Error downloading {url}: {str(e)}")
                    failed_urls.append(url)
                    
                progress_var.set(idx)
                progress.update()
                
            progress.destroy()
            
            # Show completion message
            if failed_urls:
                messagebox.showwarning(
                    "Download Complete",
                    f"Downloaded {success_count} images.\n{len(failed_urls)} downloads failed."
                )
            else:
                messagebox.showinfo(
                    "Download Complete",
                    f"Successfully downloaded {success_count} images."
                )
                
        except Exception as e:
            self.logger.log_step(f"Error in batch download: {str(e)}")
            messagebox.showerror("Error", f"Download failed: {str(e)}")

    def get_ssl_context(self):
        """Get SSL context similar to url_handler."""
        try:
            import certifi # type: ignore 
            ssl_context = ssl.create_default_context(cafile=certifi.where())
        except ImportError:
            ssl_context = ssl.create_default_context()
            ssl_context.check_hostname = False
            ssl_context.verify_mode = ssl.CERT_NONE
        return ssl_context