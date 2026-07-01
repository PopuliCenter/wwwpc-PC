/**
 * Condition Evaluator Engine
 *
 * A pure function that evaluates conditions for skip logic, visibility rules,
 * and page branching. Supports operators: equals, not_equals, contains,
 * greater_than, less_than.
 */

export type ConditionOperator = 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than';

/**
 * Evaluates a condition given an operator, expected value, and actual answer value.
 *
 * @param operator - The comparison operator to use
 * @param conditionValue - The expected/configured value to compare against
 * @param actualValue - The actual answer value from the respondent
 * @returns boolean - Whether the condition is met
 */
export function evaluateCondition(
  operator: ConditionOperator,
  conditionValue: string,
  actualValue: string | number | string[] | null | undefined,
): boolean {
  if (actualValue === null || actualValue === undefined) {
    return false;
  }

  switch (operator) {
    case 'equals':
      return evaluateEquals(conditionValue, actualValue);
    case 'not_equals':
      return !evaluateEquals(conditionValue, actualValue);
    case 'contains':
      return evaluateContains(conditionValue, actualValue);
    case 'greater_than':
      return evaluateGreaterThan(conditionValue, actualValue);
    case 'less_than':
      return evaluateLessThan(conditionValue, actualValue);
    default:
      return false;
  }
}

/**
 * Equals: exact match for strings/numbers, or checks if array contains the value
 * for multiple choice answers.
 */
function evaluateEquals(conditionValue: string, actualValue: string | number | string[]): boolean {
  if (Array.isArray(actualValue)) {
    // For multiple choice: check if the condition value is one of the selected options
    return actualValue.includes(conditionValue);
  }

  if (typeof actualValue === 'number') {
    const numCondition = Number(conditionValue);
    if (isNaN(numCondition)) return false;
    return actualValue === numCondition;
  }

  return String(actualValue) === conditionValue;
}

/**
 * Contains: substring match for strings, or element exists in array.
 */
function evaluateContains(
  conditionValue: string,
  actualValue: string | number | string[],
): boolean {
  if (Array.isArray(actualValue)) {
    return actualValue.includes(conditionValue);
  }

  return String(actualValue).includes(conditionValue);
}

/**
 * Greater than: numeric comparison.
 */
function evaluateGreaterThan(
  conditionValue: string,
  actualValue: string | number | string[],
): boolean {
  if (Array.isArray(actualValue)) {
    return false;
  }

  const numActual = typeof actualValue === 'number' ? actualValue : Number(actualValue);
  const numCondition = Number(conditionValue);

  if (isNaN(numActual) || isNaN(numCondition)) {
    return false;
  }

  return numActual > numCondition;
}

/**
 * Less than: numeric comparison.
 */
function evaluateLessThan(
  conditionValue: string,
  actualValue: string | number | string[],
): boolean {
  if (Array.isArray(actualValue)) {
    return false;
  }

  const numActual = typeof actualValue === 'number' ? actualValue : Number(actualValue);
  const numCondition = Number(conditionValue);

  if (isNaN(numActual) || isNaN(numCondition)) {
    return false;
  }

  return numActual < numCondition;
}
