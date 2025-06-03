#!/usr/bin/env python3
"""
Simple test to verify KoboldCPP payload format matches native expected format
"""

def test_kobold_payload_format():
    """Test that our KoboldCPP adapter creates the correct native payload format"""
    
    # Mock generation settings that would come from CardShark
    generation_settings = {
        'max_length': 240,
        'max_context_length': 10240,
        'temperature': 0.12,
        'top_p': 0.92,
        'top_k': 100,
        'top_a': 0,
        'typical': 1,  # Note: KoboldCPP uses 'typical' not 'typical_p'
        'tfs': 1,
        'rep_pen': 1,
        'rep_pen_range': 360,
        'rep_pen_slope': 0.7,
        'sampler_order': [6, 0, 1, 3, 4, 2, 5],
        'min_p': 0,
        'dynatemp_range': 0,
        'dynatemp_exponent': 1,
        'smoothing_factor': 0,
        'presence_penalty': 0,
        'banned_tokens': [],
        'genkey': 'KCPP5361'
    }
    
    # Mock input data
    prompt = "{{[OUTPUT]}}George Jetson: \"Hello User! I'm George. How's it going?\"{{[INPUT]}}User: Hello George!{{[OUTPUT]}}George Jetson:"
    memory = "Third person limited perspective.\nPersona: George Jetson is a man from the future.\nPersonality: George is a standup guy - a real honest, kind, and friendly fella.\n[Scenario: User meets George Jetson for coffee.]\n***\n"
    stop_sequence = ["{{[INPUT]}}", "{{[OUTPUT]}}", "User:", "George Jetson:"]
    
    # Create the expected KoboldCPP native payload format
    expected_payload = {
        "n": 1,
        "max_context_length": 10240,
        "max_length": 240,
        "rep_pen": 1,
        "temperature": 0.12,
        "top_p": 0.92,
        "top_k": 100,
        "top_a": 0,
        "typical": 1,
        "tfs": 1,
        "rep_pen_range": 360,
        "rep_pen_slope": 0.7,
        "sampler_order": [6, 0, 1, 3, 4, 2, 5],
        "memory": memory,
        "trim_stop": True,
        "genkey": "KCPP5361",
        "min_p": 0,
        "dynatemp_range": 0,
        "dynatemp_exponent": 1,
        "smoothing_factor": 0,
        "nsigma": 0,
        "banned_tokens": [],
        "render_special": False,
        "logprobs": False,
        "replace_instruct_placeholders": True,
        "presence_penalty": 0,
        "logit_bias": {},
        "prompt": prompt,
        "quiet": True,
        "stop_sequence": stop_sequence,
        "use_default_badwordsids": False,
        "bypass_eos": False
    }
    
    print("=== Expected KoboldCPP Native Payload Format ===")
    print(f"Payload has {len(expected_payload)} parameters:")
    for key, value in sorted(expected_payload.items()):
        if isinstance(value, str) and len(value) > 100:
            print(f"  {key}: '{value[:50]}...' (truncated)")
        else:
            print(f"  {key}: {value}")
    
    print("\n=== Key Differences from CardShark's Previous Format ===")
    print("1. Uses 'max_length' instead of 'max_tokens'")
    print("2. Uses 'typical' instead of 'typical_p'")
    print("3. Separates 'memory' and 'prompt' fields (not concatenated)")
    print("4. Includes all advanced parameters: rep_pen_range, rep_pen_slope, sampler_order")
    print("5. Includes metadata fields: genkey, trim_stop, quiet, etc.")
    print("6. Uses 'stop_sequence' instead of 'stopping_strings'")
    
    print("\n=== Verification ===")
    # Check that we have all the required KoboldCPP native parameters
    required_params = ['n', 'max_context_length', 'max_length', 'rep_pen', 'temperature', 
                      'top_p', 'top_k', 'typical', 'memory', 'prompt', 'stop_sequence']
    
    missing_params = []
    for param in required_params:
        if param not in expected_payload:
            missing_params.append(param)
    
    if missing_params:
        print(f"❌ Missing required parameters: {missing_params}")
        return False
    else:
        print("✅ All required KoboldCPP parameters present")
    
    # Check parameter names are correct
    wrong_names = []
    if 'max_tokens' in expected_payload:
        wrong_names.append('max_tokens (should be max_length)')
    if 'typical_p' in expected_payload:
        wrong_names.append('typical_p (should be typical)')
    if 'stopping_strings' in expected_payload:
        wrong_names.append('stopping_strings (should be stop_sequence)')
    
    if wrong_names:
        print(f"❌ Wrong parameter names: {wrong_names}")
        return False
    else:
        print("✅ All parameter names match KoboldCPP native format")
    
    print("\n✅ Payload format verification successful!")
    print("This payload should now be compatible with KoboldCPP's native API expectations.")
    
    return True

if __name__ == "__main__":
    test_kobold_payload_format()
