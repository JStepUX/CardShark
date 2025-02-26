# CardShark Templates Feature

## Overview

CardShark's Templates feature allows you to customize and create chat completion templates to match different LLM formats. This document explains how to use and customize templates.

## What are Templates?

Templates define how messages are formatted when sent to an LLM backend (like KoboldCPP). Different model architectures often require specific formatting:

- **ChatML** format (used by many models)
- **Mistral** format (for Mistral-based models)  
- **Llama** format (for Llama models)
- **Gemini** format (for Google's Gemini models)
- **Claude** format (for Anthropic's Claude models)

## Using Templates

1. Go to **Settings → Templates**
2. Browse available templates
3. Edit existing templates or create new ones
4. Once saved, you can select templates in the API configuration (Settings → API)

## Template Components

Each template consists of:

- **Name and Description**: Identify the template
- **Memory Format**: How character information is formatted
- **System Format**: How system messages are formatted
- **User Format**: How user messages are formatted
- **Assistant Format**: How assistant (character) responses are formatted
- **Stop Sequences**: Patterns that tell the LLM to stop generating
- **Detection Patterns**: Used to identify the template format from API responses

## Variables

You can use these variables in your templates:

- `{{content}}`: The message content
- `{{char}}`: The character name
- `{{description}}`: Character description
- `{{personality}}`: Character personality
- `{{scenario}}`: Character scenario
- `{{#if system}}...{{/if}}`: Conditional block for system prompt

## Example Template

Here's a sample Mistral template:

```
Name: Mistral
Description: Format for Mistral models using [INST] tags

Memory Format:
{{#if system}}[INST] {{system}} [/INST]
{{/if}}Persona: {{description}}
Personality: {{personality}}
[Scenario: {{scenario}}]

System Format: [INST] {{content}} [/INST]
User Format: [INST] {{content}} [/INST]
Assistant Format: {{char}}: {{content}}

Stop Sequences:
- [INST]
- User:
- Assistant:
- {{char}}:
```

## Managing Templates

- **Create**: Click the "+" button to create a new template
- **Duplicate**: Copy an existing template to create a variation
- **Edit**: Modify any custom template (built-in templates cannot be edited)
- **Delete**: Remove custom templates (built-in templates cannot be deleted)
- **Import/Export**: Use the upload/download buttons to share templates

## Advanced Tips

1. Test template changes with simple messages first
2. Different models may require slight variations in formatting
3. If a model generates multiple responses or stops too early, adjust the stop sequences
4. Use the Chat debugging tool to see exactly what is being sent to the API

## Troubleshooting

If you encounter issues:

- Check the console for template-related errors
- Try switching to a built-in template to see if the issue persists
- Make sure your template has all required fields (especially User and Assistant formats)
- Verify that your stop sequences are correctly formatted

For additional help, refer to the CardShark documentation or community forums.