import { sharedIndex2 } from './Index2';

export const bestAlias = (rawLink: string): string => {
  const all = sharedIndex2().alias(rawLink);

  const longestString = all.reduce((longest, current) => {
    if (current.length > longest.length || (current.length === longest.length && current < longest)) {
      return current;
    } else {
      return longest;
    }
  });

  return longestString;
};
