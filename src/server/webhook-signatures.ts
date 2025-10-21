import { createHmac, timingSafeEqual } from 'crypto';

export class WebhookSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebhookSignatureError';
  }
}

/**
 * Generates a webhook signature using HMAC-SHA256
 * @param secret - The webhook secret
 * @param timestamp - Unix timestamp in seconds
 * @param payload - The webhook payload as a string
 * @returns The signature in the format: t=timestamp,v1=signature
 */
export function generateWebhookSignature(
  secret: string,
  timestamp: number,
  payload: string
): string {
  const signedPayload = `${timestamp}.${payload}`;
  const hmac = createHmac('sha256', secret);
  hmac.update(signedPayload);
  const signature = hmac.digest('hex');
  
  return `t=${timestamp},v1=${signature}`;
}

/**
 * Validates a webhook signature using constant-time comparison
 * @param secret - The webhook secret
 * @param signatureHeader - The X-MDK-Signature header value
 * @param payload - The webhook payload as a string
 * @param toleranceSeconds - Time tolerance window in seconds (default: 300 = 5 minutes)
 * @returns true if signature is valid
 * @throws WebhookSignatureError if validation fails
 */
export function validateWebhookSignature(
  secret: string,
  signatureHeader: string | null | undefined,
  payload: string,
  toleranceSeconds: number = 300
): boolean {
  if (!signatureHeader) {
    throw new WebhookSignatureError('Missing signature header');
  }

  if (!secret) {
    throw new WebhookSignatureError('Webhook secret is not configured');
  }

  // Parse the signature header: t=timestamp,v1=signature
  const parts = signatureHeader.split(',');
  const timestampPart = parts.find((part) => part.startsWith('t='));
  const signaturePart = parts.find((part) => part.startsWith('v1='));

  if (!timestampPart || !signaturePart) {
    throw new WebhookSignatureError('Invalid signature header format');
  }

  const timestamp = parseInt(timestampPart.substring(2), 10);
  const receivedSignature = signaturePart.substring(3);

  if (isNaN(timestamp)) {
    throw new WebhookSignatureError('Invalid timestamp in signature');
  }

  // Check timestamp tolerance to prevent replay attacks
  const currentTime = Math.floor(Date.now() / 1000);
  const timeDifference = Math.abs(currentTime - timestamp);

  if (timeDifference > toleranceSeconds) {
    throw new WebhookSignatureError(
      `Timestamp outside tolerance window (${timeDifference}s > ${toleranceSeconds}s)`
    );
  }

  // Generate expected signature
  const signedPayload = `${timestamp}.${payload}`;
  const hmac = createHmac('sha256', secret);
  hmac.update(signedPayload);
  const expectedSignature = hmac.digest('hex');

  // Use constant-time comparison to prevent timing attacks
  if (receivedSignature.length !== expectedSignature.length) {
    throw new WebhookSignatureError('Invalid signature');
  }

  const receivedBuffer = Buffer.from(receivedSignature, 'hex');
  const expectedBuffer = Buffer.from(expectedSignature, 'hex');

  if (!timingSafeEqual(receivedBuffer, expectedBuffer)) {
    throw new WebhookSignatureError('Invalid signature');
  }

  return true;
}
