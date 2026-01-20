import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  toCamelCase,
  normalizeFieldName,
  cleanCustomerInput,
  normalizeRequireCustomerData,
} from '../src/actions'

import {
  fieldToLabel,
  getMissingRequiredFields,
  convertCustomAmountToSmallestUnit,
  validateCustomAmount,
} from '../src/checkout-utils'

// ============================================================================
// toCamelCase Tests
// ============================================================================

describe('toCamelCase', () => {
  it('converts snake_case to camelCase', () => {
    assert.equal(toCamelCase('custom_field'), 'customField')
    assert.equal(toCamelCase('billing_address'), 'billingAddress')
    assert.equal(toCamelCase('first_name'), 'firstName')
  })

  it('converts kebab-case to camelCase', () => {
    assert.equal(toCamelCase('custom-field'), 'customField')
    assert.equal(toCamelCase('billing-address'), 'billingAddress')
    assert.equal(toCamelCase('first-name'), 'firstName')
  })

  it('converts space separated to camelCase', () => {
    assert.equal(toCamelCase('custom field'), 'customField')
    assert.equal(toCamelCase('billing address'), 'billingAddress')
    assert.equal(toCamelCase('first name'), 'firstName')
  })

  it('converts PascalCase to camelCase', () => {
    assert.equal(toCamelCase('CustomField'), 'customField')
    assert.equal(toCamelCase('BillingAddress'), 'billingAddress')
    assert.equal(toCamelCase('FirstName'), 'firstName')
  })

  it('preserves already camelCase strings', () => {
    assert.equal(toCamelCase('customField'), 'customField')
    assert.equal(toCamelCase('billingAddress'), 'billingAddress')
    assert.equal(toCamelCase('firstName'), 'firstName')
  })

  it('converts Title Case with spaces', () => {
    assert.equal(toCamelCase('Custom Field'), 'customField')
    assert.equal(toCamelCase('Billing Address'), 'billingAddress')
  })

  it('handles single word', () => {
    assert.equal(toCamelCase('email'), 'email')
    assert.equal(toCamelCase('name'), 'name')
    assert.equal(toCamelCase('Email'), 'email')
  })

  it('handles mixed formats', () => {
    assert.equal(toCamelCase('my_custom-field Name'), 'myCustomFieldName')
  })

  it('handles consecutive delimiters', () => {
    assert.equal(toCamelCase('custom__field'), 'customField')
    assert.equal(toCamelCase('custom--field'), 'customField')
    assert.equal(toCamelCase('custom  field'), 'customField')
  })

  it('handles empty string', () => {
    assert.equal(toCamelCase(''), '')
  })

  it('handles acronyms in PascalCase (lowercases entire first word)', () => {
    // Note: the function doesn't specially handle acronyms - it lowercases the entire first word
    // This is acceptable for the use case (field name normalization)
    assert.equal(toCamelCase('HTTPServer'), 'httpserver')
    assert.equal(toCamelCase('XMLParser'), 'xmlparser')
  })
})

// ============================================================================
// normalizeFieldName Tests
// ============================================================================

describe('normalizeFieldName', () => {
  it('preserves standard fields in correct format', () => {
    assert.equal(normalizeFieldName('email'), 'email')
    assert.equal(normalizeFieldName('name'), 'name')
    assert.equal(normalizeFieldName('externalId'), 'externalId')
  })

  it('normalizes non-standard snake_case to camelCase', () => {
    assert.equal(normalizeFieldName('custom_field'), 'customField')
    assert.equal(normalizeFieldName('billing_address'), 'billingAddress')
  })

  it('normalizes standard fields from different formats', () => {
    assert.equal(normalizeFieldName('Email'), 'email')
    assert.equal(normalizeFieldName('external_id'), 'externalId')
    assert.equal(normalizeFieldName('external-id'), 'externalId')
  })

  it('handles custom fields with various formats', () => {
    assert.equal(normalizeFieldName('company_name'), 'companyName')
    assert.equal(normalizeFieldName('phone-number'), 'phoneNumber')
    assert.equal(normalizeFieldName('ShippingAddress'), 'shippingAddress')
  })
})

// ============================================================================
// cleanCustomerInput Tests
// ============================================================================

describe('cleanCustomerInput', () => {
  it('returns undefined for undefined input', () => {
    assert.equal(cleanCustomerInput(undefined), undefined)
  })

  it('returns undefined for empty object', () => {
    assert.equal(cleanCustomerInput({}), undefined)
  })

  it('returns undefined for object with only empty strings', () => {
    assert.equal(cleanCustomerInput({ name: '', email: '' }), undefined)
  })

  it('returns undefined for object with whitespace-only strings', () => {
    assert.equal(cleanCustomerInput({ name: '   ', email: '  ' }), undefined)
  })

  it('keeps non-empty string values', () => {
    const result = cleanCustomerInput({ name: 'John', email: 'john@example.com' })
    assert.deepEqual(result, { name: 'John', email: 'john@example.com' })
  })

  it('filters out empty strings while keeping non-empty values', () => {
    const result = cleanCustomerInput({ name: 'John', email: '', phone: '123' })
    assert.deepEqual(result, { name: 'John', phone: '123' })
  })

  it('normalizes keys to camelCase', () => {
    const result = cleanCustomerInput({ 'custom_field': 'value', 'another-field': 'test' })
    assert.deepEqual(result, { customField: 'value', anotherField: 'test' })
  })

  it('normalizes standard field names', () => {
    const result = cleanCustomerInput({ 'external_id': 'ext123', 'Email': 'test@example.com' })
    assert.deepEqual(result, { externalId: 'ext123', email: 'test@example.com' })
  })

  it('handles mixed valid and invalid values', () => {
    const result = cleanCustomerInput({
      name: 'John',
      email: '',
      'custom_field': '  ',
      phone: '555-1234',
    })
    assert.deepEqual(result, { name: 'John', phone: '555-1234' })
  })
})

// ============================================================================
// normalizeRequireCustomerData Tests
// ============================================================================

describe('normalizeRequireCustomerData', () => {
  it('returns undefined for undefined input', () => {
    assert.equal(normalizeRequireCustomerData(undefined), undefined)
  })

  it('returns empty array for empty array', () => {
    assert.deepEqual(normalizeRequireCustomerData([]), [])
  })

  it('preserves standard field names', () => {
    assert.deepEqual(
      normalizeRequireCustomerData(['email', 'name', 'externalId']),
      ['email', 'name', 'externalId']
    )
  })

  it('normalizes snake_case field names', () => {
    assert.deepEqual(
      normalizeRequireCustomerData(['email', 'custom_field', 'external_id']),
      ['email', 'customField', 'externalId']
    )
  })

  it('normalizes various formats', () => {
    assert.deepEqual(
      normalizeRequireCustomerData(['billing_address', 'ShippingAddress', 'phone-number']),
      ['billingAddress', 'shippingAddress', 'phoneNumber']
    )
  })
})

// ============================================================================
// fieldToLabel Tests
// ============================================================================

describe('fieldToLabel', () => {
  it('converts camelCase to readable label', () => {
    assert.equal(fieldToLabel('billingAddress'), 'Billing Address')
    assert.equal(fieldToLabel('firstName'), 'First Name')
    assert.equal(fieldToLabel('phoneNumber'), 'Phone Number')
  })

  it('capitalizes single-word fields', () => {
    assert.equal(fieldToLabel('email'), 'Email')
    assert.equal(fieldToLabel('name'), 'Name')
    assert.equal(fieldToLabel('phone'), 'Phone')
  })

  it('handles multiple capital letters', () => {
    assert.equal(fieldToLabel('companyURL'), 'Company U R L')
    assert.equal(fieldToLabel('customHTTPField'), 'Custom H T T P Field')
  })

  it('handles already-capitalized first letter', () => {
    assert.equal(fieldToLabel('Email'), 'Email')
    assert.equal(fieldToLabel('Name'), 'Name')
  })

  it('handles empty string', () => {
    assert.equal(fieldToLabel(''), '')
  })

  it('handles externalId', () => {
    assert.equal(fieldToLabel('externalId'), 'External Id')
  })
})

// ============================================================================
// getMissingRequiredFields Tests
// ============================================================================

describe('getMissingRequiredFields', () => {
  // Type for minimal checkout needed by getMissingRequiredFields
  type MinimalCheckout = Parameters<typeof getMissingRequiredFields>[0]

  const makeCheckout = (
    requireCustomerData?: string[],
    customer?: Record<string, unknown>
  ): MinimalCheckout => ({
    id: 'checkout_123',
    status: 'UNCONFIRMED' as const,
    type: 'AMOUNT' as const,
    currency: 'USD' as const,
    requireCustomerData,
    customer,
    createdAt: '2024-01-01T00:00:00Z',
    expiresAt: '2024-01-02T00:00:00Z',
  } as unknown as MinimalCheckout)

  it('returns empty array when requireCustomerData is undefined', () => {
    const checkout = makeCheckout(undefined, {})
    assert.deepEqual(getMissingRequiredFields(checkout), [])
  })

  it('returns empty array when requireCustomerData is empty', () => {
    const checkout = makeCheckout([], {})
    assert.deepEqual(getMissingRequiredFields(checkout), [])
  })

  it('returns all fields when customer is undefined', () => {
    const checkout = makeCheckout(['email', 'name'], undefined)
    assert.deepEqual(getMissingRequiredFields(checkout), ['email', 'name'])
  })

  it('returns all fields when customer has no matching values', () => {
    const checkout = makeCheckout(['email', 'name'], {})
    assert.deepEqual(getMissingRequiredFields(checkout), ['email', 'name'])
  })

  it('filters out fields that are already provided', () => {
    const checkout = makeCheckout(['email', 'name', 'phone'], {
      email: 'john@example.com',
      name: 'John',
    })
    assert.deepEqual(getMissingRequiredFields(checkout), ['phone'])
  })

  it('treats empty string as missing', () => {
    const checkout = makeCheckout(['email', 'name'], {
      email: '',
      name: 'John',
    })
    assert.deepEqual(getMissingRequiredFields(checkout), ['email'])
  })

  it('treats null as missing', () => {
    const checkout = makeCheckout(['email', 'name'], {
      email: null,
      name: 'John',
    })
    assert.deepEqual(getMissingRequiredFields(checkout), ['email'])
  })

  it('returns empty array when all required fields are provided', () => {
    const checkout = makeCheckout(['email', 'name'], {
      email: 'john@example.com',
      name: 'John',
    })
    assert.deepEqual(getMissingRequiredFields(checkout), [])
  })

  it('handles custom fields', () => {
    const checkout = makeCheckout(['email', 'companyName', 'taxId'], {
      email: 'john@example.com',
    })
    assert.deepEqual(getMissingRequiredFields(checkout), ['companyName', 'taxId'])
  })
})

// ============================================================================
// convertCustomAmountToSmallestUnit Tests
// ============================================================================

describe('convertCustomAmountToSmallestUnit', () => {
  describe('USD currency', () => {
    it('converts dollars to cents', () => {
      assert.equal(convertCustomAmountToSmallestUnit('10', 'USD'), 1000)
      assert.equal(convertCustomAmountToSmallestUnit('1', 'USD'), 100)
      assert.equal(convertCustomAmountToSmallestUnit('0.01', 'USD'), 1)
    })

    it('handles decimal amounts correctly', () => {
      assert.equal(convertCustomAmountToSmallestUnit('10.99', 'USD'), 1099)
      assert.equal(convertCustomAmountToSmallestUnit('25.50', 'USD'), 2550)
      assert.equal(convertCustomAmountToSmallestUnit('0.99', 'USD'), 99)
    })

    it('handles floating point precision issues', () => {
      // Classic floating point issue: 19.99 * 100 = 1998.9999999999998
      assert.equal(convertCustomAmountToSmallestUnit('19.99', 'USD'), 1999)
      assert.equal(convertCustomAmountToSmallestUnit('29.99', 'USD'), 2999)
    })

    it('rounds to nearest cent', () => {
      assert.equal(convertCustomAmountToSmallestUnit('10.995', 'USD'), 1100)
      assert.equal(convertCustomAmountToSmallestUnit('10.994', 'USD'), 1099)
    })
  })

  describe('SAT currency', () => {
    it('uses sats directly without conversion', () => {
      assert.equal(convertCustomAmountToSmallestUnit('1000', 'SAT'), 1000)
      assert.equal(convertCustomAmountToSmallestUnit('1', 'SAT'), 1)
      assert.equal(convertCustomAmountToSmallestUnit('21000000', 'SAT'), 21000000)
    })

    it('rounds decimal sats', () => {
      assert.equal(convertCustomAmountToSmallestUnit('1.5', 'SAT'), 2)
      assert.equal(convertCustomAmountToSmallestUnit('1.4', 'SAT'), 1)
    })
  })

  describe('invalid input', () => {
    it('returns 0 for empty string', () => {
      assert.equal(convertCustomAmountToSmallestUnit('', 'USD'), 0)
      assert.equal(convertCustomAmountToSmallestUnit('', 'SAT'), 0)
    })

    it('returns 0 for non-numeric string', () => {
      assert.equal(convertCustomAmountToSmallestUnit('abc', 'USD'), 0)
      assert.equal(convertCustomAmountToSmallestUnit('invalid', 'SAT'), 0)
    })

    it('handles zero', () => {
      assert.equal(convertCustomAmountToSmallestUnit('0', 'USD'), 0)
      assert.equal(convertCustomAmountToSmallestUnit('0', 'SAT'), 0)
    })
  })
})

// ============================================================================
// validateCustomAmount Tests
// ============================================================================

describe('validateCustomAmount', () => {
  describe('USD currency', () => {
    it('returns null for valid amounts', () => {
      assert.equal(validateCustomAmount('10', 'USD'), null)
      assert.equal(validateCustomAmount('0.01', 'USD'), null)
      assert.equal(validateCustomAmount('100.50', 'USD'), null)
    })

    it('returns error for empty string', () => {
      assert.equal(validateCustomAmount('', 'USD'), 'Please enter a valid amount')
    })

    it('returns error for non-numeric input', () => {
      assert.equal(validateCustomAmount('abc', 'USD'), 'Please enter a valid amount')
    })

    it('returns error for amount below minimum (0.01)', () => {
      assert.equal(validateCustomAmount('0', 'USD'), 'Please enter a valid amount')
      assert.equal(validateCustomAmount('0.001', 'USD'), 'Please enter a valid amount')
      assert.equal(validateCustomAmount('0.009', 'USD'), 'Please enter a valid amount')
    })

    it('accepts exactly minimum amount', () => {
      assert.equal(validateCustomAmount('0.01', 'USD'), null)
    })

    it('returns error for negative amounts', () => {
      assert.equal(validateCustomAmount('-1', 'USD'), 'Please enter a valid amount')
      assert.equal(validateCustomAmount('-0.01', 'USD'), 'Please enter a valid amount')
    })
  })

  describe('SAT currency', () => {
    it('returns null for valid amounts', () => {
      assert.equal(validateCustomAmount('1', 'SAT'), null)
      assert.equal(validateCustomAmount('1000', 'SAT'), null)
      assert.equal(validateCustomAmount('21000000', 'SAT'), null)
    })

    it('returns error for empty string', () => {
      assert.equal(validateCustomAmount('', 'SAT'), 'Please enter at least 1 sat')
    })

    it('returns error for non-numeric input', () => {
      assert.equal(validateCustomAmount('abc', 'SAT'), 'Please enter at least 1 sat')
    })

    it('returns error for amount below minimum (1 sat)', () => {
      assert.equal(validateCustomAmount('0', 'SAT'), 'Please enter at least 1 sat')
      assert.equal(validateCustomAmount('0.5', 'SAT'), 'Please enter at least 1 sat')
      assert.equal(validateCustomAmount('0.99', 'SAT'), 'Please enter at least 1 sat')
    })

    it('accepts exactly minimum amount', () => {
      assert.equal(validateCustomAmount('1', 'SAT'), null)
    })

    it('returns error for negative amounts', () => {
      assert.equal(validateCustomAmount('-1', 'SAT'), 'Please enter at least 1 sat')
      assert.equal(validateCustomAmount('-100', 'SAT'), 'Please enter at least 1 sat')
    })
  })
})
