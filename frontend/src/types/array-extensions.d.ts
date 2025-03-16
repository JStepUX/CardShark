// src/types/array-extensions.d.ts

/**
 * Type declarations for ES2024 Array methods
 */
interface Array<T> {
  /**
   * Groups elements by the string value returned by the callback function.
   * @param callbackfn Function that returns a string value to group by
   * @param thisArg An object to which the this keyword can refer in the callbackfn
   */
  groupBy<K extends PropertyKey>(
    callbackfn: (value: T, index: number, array: T[]) => K,
    thisArg?: any
  ): Record<K, T[]>;

  /**
   * Returns a new array with elements sorted according to the comparison function.
   * @param compareFn Function that defines the sort order
   */
  toSorted(compareFn?: (a: T, b: T) => number): T[];

  /**
   * Returns a new array with elements in reversed order.
   */
  toReversed(): T[];

  /**
   * Returns a new array with some elements removed and/or replaced.
   * @param start The zero-based index at which to start changing the array
   * @param deleteCount The number of elements to remove
   * @param items The elements to add to the array, beginning from start
   */
  toSpliced(start: number, deleteCount?: number, ...items: T[]): T[];

  /**
   * Returns a new array with the callback function applied to each element.
   * @param callbackfn Function that produces an element of the new array
   * @param thisArg An object to which the this keyword can refer in the callbackfn
   */
  with(index: number, value: T): T[];
}