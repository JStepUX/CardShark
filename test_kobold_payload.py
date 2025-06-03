#!/usr/bin/env python3
"""
Test script to verify that CardShark's KoboldCPP adapter now produces
payloads that match KoboldCPP's native format.
"""

import sys
import os
import json

# Add the backend directory to the Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

from api_provider_adapters import KoboldCppAdapter
from log_manager import LogManager

def test_kobold_payload():
    """Test that KoboldCPP adapter produces correct native format"""
      # Create adapter instance
    logger = LogManager()
    adapter = KoboldCppAdapter(logger)
    
    # Sample generation settings (typical CardShark values)
    generation_settings = {
        'max_length': 220,
        'max_context_length': 6144,
        'temperature': 1.05,
        'top_p': 0.92,
        'top_k': 100,
        'top_a': 0,
        'typical': 1,  # Note: 'typical' not 'typical_p'
        'tfs': 1,
        'min_p': 0,
        'rep_pen': 1.07,
        'rep_pen_range': 360,
        'rep_pen_slope': 0.7,
        'sampler_order': [6, 0, 1, 3, 4, 2, 5],
        'dynatemp_range': 0.45,
        'dynatemp_exponent': 1,
        'smoothing_factor': 0,
        'presence_penalty': 0
    }
    
    # Sample prompt and memory
    prompt = 'George Jetson: "Hello {{user}}! I\'m George. How\'s it going?"'
    memory = '''Character: George Jetson
Description: George Jetson is a man from the future.
Personality: George is a standup guy - a real honest, kind, and friendly fella.
Scenario: {{user}} meets George Jetson for coffee.
Third person limited perspective.'''
    
    stop_sequence = ["[INST]", "User:", "Assistant:", "{{user}}:", "</s>"]
    
    # Generate payload using our adapter
    payload = adapter.prepare_request_data(
        prompt=prompt,
        memory=memory,
        stop_sequence=stop_sequence,
        generation_settings=generation_settings
    )
    
    print("=== CardShark KoboldCPP Native Payload ===")
    print(json.dumps(payload, indent=2))
    
    # Expected KoboldCPP native format fields
    expected_fields = [
        'n', 'max_context_length', 'max_length', 'rep_pen', 'temperature',
        'top_p', 'top_k', 'top_a', 'typical', 'tfs', 'rep_pen_range',
        'rep_pen_slope', 'sampler_order', 'memory', 'prompt', 'trim_stop',
        'quiet', 'use_default_badwordsids', 'bypass_eos', 'min_p',
        'dynatemp_range', 'dynatemp_exponent', 'smoothing_factor',
        'presence_penalty', 'banned_tokens', 'render_special', 'logprobs',
        'replace_instruct_placeholders', 'logit_bias', 'stop_sequence', 'nsigma'
    ]
    
    # Verify all expected fields are present
    missing_fields = []
    for field in expected_fields:
        if field not in payload:
            missing_fields.append(field)
    
    print(f"\n=== Field Verification ===")
    print(f"Total fields in payload: {len(payload)}")
    print(f"Expected fields: {len(expected_fields)}")
    
    if missing_fields:
        print(f"❌ Missing fields: {missing_fields}")
    else:
        print("✅ All expected fields present")
    
    # Verify correct parameter names (not the old CardShark format)
    correct_params = []
    incorrect_params = []
    
    # Check for correct naming
    if 'max_length' in payload and 'max_tokens' not in payload:
        correct_params.append("max_length ✅")
    elif 'max_tokens' in payload:
        incorrect_params.append("max_tokens (should be max_length) ❌")
        
    if 'typical' in payload and 'typical_p' not in payload:
        correct_params.append("typical ✅")
    elif 'typical_p' in payload:
        incorrect_params.append("typical_p (should be typical) ❌")
    
    # Check memory/prompt separation
    if 'memory' in payload and 'prompt' in payload:
        if payload['memory'] and payload['prompt']:
            correct_params.append("memory/prompt separation ✅")
        else:
            incorrect_params.append("memory/prompt not properly separated ❌")
    
    print(f"\n=== Parameter Name Verification ===")
    for param in correct_params:
        print(param)
    for param in incorrect_params:
        print(param)
    
    # Verify specific KoboldCPP metadata fields
    kobold_metadata = ['n', 'quiet', 'trim_stop', 'use_default_badwordsids', 'bypass_eos']
    print(f"\n=== KoboldCPP Metadata Fields ===")
    for field in kobold_metadata:
        if field in payload:
            print(f"{field}: {payload[field]} ✅")
        else:
            print(f"{field}: MISSING ❌")
    
    print(f"\n=== Summary ===")
    if not missing_fields and not incorrect_params:
        print("🎉 SUCCESS: Payload matches KoboldCPP native format!")
    else:
        print("⚠️  Issues found with payload format")
    
    return payload

if __name__ == "__main__":
    test_kobold_payload()
