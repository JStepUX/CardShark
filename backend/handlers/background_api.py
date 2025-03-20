from flask import request, jsonify, send_file
from werkzeug.utils import secure_filename
from ..background_handler import BackgroundHandler
from typing import Dict, Any

def register_background_routes(app, background_handler: BackgroundHandler, logger):
    """
    Register background-related API routes
    """
    
    @app.route('/api/backgrounds', methods=['GET'])
    def get_backgrounds():
        """List all available backgrounds"""
        try:
            backgrounds = background_handler.get_all_backgrounds()
            
            return jsonify({
                "success": True,
                "backgrounds": backgrounds
            })
            
        except Exception as e:
            logger.log_error(f"Error fetching backgrounds: {str(e)}")
            return jsonify({
                "success": False,
                "message": "Failed to fetch backgrounds"
            }), 500
    
    @app.route('/api/backgrounds/upload', methods=['POST'])
    def upload_background():
        """Upload a new background image"""
        try:
            if 'file' not in request.files:
                return jsonify({
                    "success": False,
                    "message": "No file provided"
                }), 400
                
            file = request.files['file']
            
            if file.filename == '':
                return jsonify({
                    "success": False,
                    "message": "No file selected"
                }), 400
                
            # Get aspect_ratio if provided
            aspect_ratio = None
            if 'aspectRatio' in request.form:
                try:
                    aspect_ratio = float(request.form['aspectRatio'])
                    logger.log_step(f"Received aspect ratio: {aspect_ratio}")
                except (ValueError, TypeError):
                    logger.log_warning("Invalid aspect ratio provided, ignoring")
            
            # Read file content
            file_content = file.read()
            original_filename = secure_filename(file.filename)
            
            # Save the background via handler
            result = background_handler.save_background(
                file_content, 
                original_filename,
                aspect_ratio
            )
            
            if result:
                logger.log_step(f"Successfully uploaded background: {result['filename']}")
                return jsonify({
                    "success": True,
                    "message": "Background uploaded successfully",
                    "background": result
                })
            else:
                return jsonify({
                    "success": False,
                    "message": "Failed to process uploaded image"
                }), 400
                
        except Exception as e:
            logger.log_error(f"Error uploading background: {str(e)}")
            return jsonify({
                "success": False,
                "message": "Failed to upload background"
            }), 500
    
    @app.route('/api/backgrounds/<path:filename>', methods=['GET'])
    def get_background_file(filename):
        """Serve a background image file"""
        try:
            file_path = background_handler.backgrounds_dir / filename
            
            if not file_path.exists():
                return jsonify({
                    "success": False,
                    "message": "Background not found"
                }), 404
                
            return send_file(file_path)
            
        except Exception as e:
            logger.log_error(f"Error serving background: {str(e)}")
            return jsonify({
                "success": False,
                "message": "Failed to serve background"
            }), 500
    
    @app.route('/api/backgrounds/<path:filename>', methods=['DELETE'])
    def delete_background_file(filename):
        """Delete a background image file"""
        try:
            success = background_handler.delete_background(filename)
            
            if success:
                return jsonify({
                    "success": True,
                    "message": "Background deleted successfully"
                })
            else:
                return jsonify({
                    "success": False,
                    "message": "Failed to delete background"
                }), 400
                
        except Exception as e:
            logger.log_error(f"Error deleting background: {str(e)}")
            return jsonify({
                "success": False,
                "message": "Failed to delete background"
            }), 500
