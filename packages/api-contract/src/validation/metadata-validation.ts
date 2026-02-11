import { type Result, err, ok } from "../lib/utils.js";

export const MAX_METADATA_SIZE_BYTES = 1024; // 1KB
export const MAX_KEY_LENGTH = 100;
export const MAX_KEY_COUNT = 50;

/**
 * Pattern matching control characters (0x00-0x1F) except:
 * - 0x09 (tab) - allowed for formatting
 * - 0x0A (LF/newline) - allowed for multi-line text
 * - 0x0D (CR/carriage return) - allowed for line endings
 *
 * Security concerns with control characters:
 * - Null bytes (0x00) can cause string truncation and injection attacks
 * - ESC (0x1B) can execute terminal escape sequences if displayed in terminals
 * - Control characters can obfuscate malicious content in logs
 * - Many databases and systems have issues storing/processing control characters
 * - Can cause JSON parsing issues in some edge cases
 * - May break string operations in various programming languages
 *
 * Matches: null (0x00), SOH-STX (0x01-0x02), EOT-ACK (0x04-0x06),
 * BEL (0x07), BS (0x08), VT (0x0B), FF (0x0C), SO-SI (0x0E-0x0F),
 * DLE-DC4 (0x10-0x14), NAK-SYN (0x15-0x16), ETB-CAN (0x17-0x18),
 * EM-SUB (0x19-0x1A), ESC-FS (0x1B-0x1C), GS-US (0x1D-0x1F)
 */
// eslint-disable-next-line no-control-regex -- This regex intentionally matches control characters for security validation
const CONTROL_CHAR_PATTERN = /[\x00-\x08\x0B-\x0C\x0E-\x1F]/;

/**
 * Pattern matching valid key format (alphanumeric, underscore, hyphen only)
 */
const VALID_KEY_PATTERN = /^[a-zA-Z0-9_-]+$/;

export type MetadataValidationError = {
	type: string;
	message: string;
};

function validateKeyFormat(key: string): Result<void, MetadataValidationError> {
	if (!VALID_KEY_PATTERN.test(key)) {
		const message =
			key === ""
				? "Metadata keys cannot be empty"
				: `Metadata key "${key}" contains invalid characters. Keys must contain only letters, numbers, underscores, and hyphens.`;
		return err({ type: "invalid_key_format", message });
	}
	return ok(undefined);
}

function validateKeyLength(key: string): Result<void, MetadataValidationError> {
	if (key.length > MAX_KEY_LENGTH) {
		return err({
			type: "key_too_long",
			message: `Metadata key "${key}" exceeds maximum length of ${MAX_KEY_LENGTH} characters`,
		});
	}
	return ok(undefined);
}

function validateNullBytes(
	key: string,
	value: string,
): Result<void, MetadataValidationError> {
	if (value.includes("\0")) {
		return err({
			type: "control_character",
			message: `Metadata value for key "${key}" cannot contain null bytes`,
		});
	}
	return ok(undefined);
}

function validateControlCharacters(
	key: string,
	value: string,
): Result<void, MetadataValidationError> {
	if (CONTROL_CHAR_PATTERN.test(value)) {
		return err({
			type: "control_character",
			message: `Metadata value for key "${key}" cannot contain control characters`,
		});
	}
	return ok(undefined);
}

function validateUtf8Encoding(
	key: string,
	value: string,
): Result<void, MetadataValidationError> {
	try {
		const encoded = new TextEncoder().encode(value);
		new TextDecoder("utf-8", { fatal: true }).decode(encoded);
	} catch {
		return err({
			type: "invalid_encoding",
			message: `Metadata value for key "${key}" contains invalid UTF-8 encoding`,
		});
	}
	return ok(undefined);
}

function validateMetadataSize(
	metadata: Record<string, string>,
): Result<void, MetadataValidationError> {
	const serialized = JSON.stringify(metadata);
	const sizeBytes = new TextEncoder().encode(serialized).length;
	if (sizeBytes > MAX_METADATA_SIZE_BYTES) {
		return err({
			type: "size_exceeded",
			message: `Metadata size (${sizeBytes} bytes) exceeds maximum allowed size (${MAX_METADATA_SIZE_BYTES} bytes). To fix this, reduce the size of your metadata values or remove unnecessary fields.`,
		});
	}
	return ok(undefined);
}

function validateKey(key: string): Result<void, MetadataValidationError> {
	const formatCheck = validateKeyFormat(key);
	if (!formatCheck.ok) return formatCheck;

	const lengthCheck = validateKeyLength(key);
	if (!lengthCheck.ok) return lengthCheck;

	return ok(undefined);
}

function validateValue(
	key: string,
	value: string,
): Result<void, MetadataValidationError> {
	const nullByteCheck = validateNullBytes(key, value);
	if (!nullByteCheck.ok) return nullByteCheck;

	const controlCharCheck = validateControlCharacters(key, value);
	if (!controlCharCheck.ok) return controlCharCheck;

	const encodingCheck = validateUtf8Encoding(key, value);
	if (!encodingCheck.ok) return encodingCheck;

	return ok(undefined);
}

/**
 * Validates checkout metadata against all security constraints.
 * Returns all validation errors found, allowing users to fix multiple issues at once.
 *
 * @param metadata - The metadata object to validate, or undefined
 * @returns A Result containing either success (ok: true) or an array of validation errors (ok: false)
 */
export function validateMetadata(
	metadata: Record<string, string> | undefined,
): Result<void, MetadataValidationError[]> {
	if (!metadata) {
		return ok(undefined);
	}

	const errors: MetadataValidationError[] = [];

	const keyCount = Object.keys(metadata).length;
	if (keyCount > MAX_KEY_COUNT) {
		errors.push({
			type: "key_count_exceeded",
			message: `Metadata contains ${keyCount} keys, which exceeds the maximum of ${MAX_KEY_COUNT} keys`,
		});
	}

	for (const [key, value] of Object.entries(metadata)) {
		const keyCheck = validateKey(key);
		if (!keyCheck.ok) {
			errors.push(keyCheck.error);
		}

		const valueCheck = validateValue(key, value);
		if (!valueCheck.ok) {
			errors.push(valueCheck.error);
		}
	}

	const sizeCheck = validateMetadataSize(metadata);
	if (!sizeCheck.ok) {
		errors.push(sizeCheck.error);
	}

	if (errors.length > 0) {
		return err(errors);
	}

	return ok(undefined);
}
