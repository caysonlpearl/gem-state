import * as React from 'react'
import { render } from '@react-email/render'
import { EmailAPIError, sendLovableEmail } from '@lovable.dev/email-js'
import { TEMPLATES } from './registry'

// Server-only: reads email provider secrets. Never import from client components.

// Configuration baked in at scaffold time
const SITE_NAME = "Gem State Classifieds"
// This is the verified sending domain currently configured in Lovable Cloud.
// Replace it with the Gem State domain after that domain is verified there.
const SENDER_DOMAIN = "notify.getparkvault.com"
const FROM_DOMAIN = "notify.getparkvault.com"

export type SendTemplateEmailResult =
  | { sent: true }
  | { sent: false; reason: 'recipient_suppressed' }

export interface SendTemplateEmailOptions {
  templateData?: Record<string, any>
  /** Dedupes retries of the same logical send; defaults to a random UUID (no dedupe). */
  idempotencyKey?: string
  replyTo?: string
}

/**
 * Renders a registered template and sends through Resend when configured.
 * Lovable's managed sender remains a compatibility fallback for existing
 * deployments that have not completed the Resend cutover.
 */
export async function sendTemplateEmail(
  templateName: string,
  to: string,
  options: SendTemplateEmailOptions = {}
): Promise<SendTemplateEmailResult> {
  const template = TEMPLATES[templateName]
  if (!template) {
    throw new Error(
      `Template '${templateName}' not found. Available: ${Object.keys(TEMPLATES).join(', ')}`
    )
  }

  // Template-level `to` takes precedence — notification templates always
  // send to their fixed address.
  const recipient = template.to || to
  if (!recipient) {
    throw new Error('Recipient is required (the template defines no fixed recipient)')
  }

  const templateData = options.templateData ?? {}
  const element = React.createElement(template.component, templateData)
  const html = await render(element)
  const text = await render(element, { plainText: true })
  const subject =
    typeof template.subject === 'function'
      ? template.subject(templateData)
      : template.subject

  const resendApiKey = process.env['RESEND_API_KEY']
  if (resendApiKey) {
    const from = process.env['RESEND_FROM_EMAIL'] || 'Gem State Classifieds <onboarding@resend.dev>'
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [recipient],
        subject,
        html,
        text,
        ...(options.replyTo ? { reply_to: options.replyTo } : {}),
        ...(options.idempotencyKey ? { idempotency_key: options.idempotencyKey } : {}),
      }),
    })
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(`Resend email failed (${response.status}): ${detail.slice(0, 400)}`)
    }
    return { sent: true }
  }

  const apiKey = process.env['LOVABLE_API_KEY']
  if (!apiKey) {
    throw new Error('RESEND_API_KEY or LOVABLE_API_KEY is not configured')
  }

  try {
    await sendLovableEmail(
      {
        to: recipient,
        from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
        sender_domain: SENDER_DOMAIN,
        subject,
        html,
        text,
        purpose: 'transactional',
        label: templateName,
        idempotency_key: options.idempotencyKey || crypto.randomUUID(),
        ...(options.replyTo ? { reply_to: options.replyTo } : {}),

      },
      { apiKey, sendUrl: process.env['LOVABLE_SEND_URL'] }
    )
  } catch (error) {
    if (error instanceof EmailAPIError && error.code === 'recipient_suppressed') {
      return { sent: false, reason: 'recipient_suppressed' }
    }
    throw error
  }

  return { sent: true }
}
