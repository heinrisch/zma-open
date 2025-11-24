import { sharedIndex2 } from './Index2';
import { getLastEditedIndexed } from './LastEditHandler';

export class ScoringUtils {
  static minScore = 0.2;

  static matchScore = (search: string, text: string): number => {
    let isearch = Array.from(search.replace(/[^a-zA-Z0-9]/g, ''));
    let itext = Array.from(text.replace(/[^a-zA-Z0-9]/g, ''));

    let score = text.toLowerCase().includes(search.toLowerCase()) ? 10 : 0;
    let penalty: number = 0;
    let cs = isearch.shift();
    let ct = itext.shift();
    let streak = 2;
    while (cs !== undefined && ct !== undefined) {
      let isMatch = false;
      if (!cs.match(/[a-z]/i)) {
        isMatch = cs === ct;
      } else {
        isMatch =
          cs.toLowerCase() === ct.toLowerCase();
      }

      if (isMatch) {
        cs = isearch.shift();
        ct = itext.shift();
        score += streak * streak;
        streak += 2;
      } else {
        ct = itext.shift();
        penalty += 1;
        streak = 2;
      }
    }
    penalty += itext.length;
    let textPenalty: number = penalty / text.length;

    let searchMiss = isearch.length;
    let searchPenalty = searchMiss / search.length;
    return score * (2 - (textPenalty + searchPenalty));
  };

  static dateScore = (targetDate: Date): number => {
    const now = new Date();
    const millisecondsInDay = 24 * 60 * 60 * 1000;

    const differenceInMilliseconds = Math.abs(now.getTime() - targetDate.getTime());
    const differenceInDays = differenceInMilliseconds / millisecondsInDay;

    const halfLife = 90;

    const score = Math.exp(-Math.log(2) * (differenceInDays / halfLife));

    return Math.max(score, this.minScore);
  };


  static recentcyScore = (targetDate: Date): number => {
    const now = new Date();
    const millisecondsInDay = 24 * 60 * 60 * 1000;

    const differenceInMilliseconds = Math.abs(now.getTime() - targetDate.getTime());
    const differenceInDays = differenceInMilliseconds / millisecondsInDay;

    const halfLife = 31; // Half-life in days, where score should be 0.5

    const score = Math.exp(-Math.log(2) * (differenceInDays / halfLife));

    return Math.max(score, this.minScore);
  };

  static frequencyScore = (rawLink: string): number => {
    const diff = sharedIndex2().linkRawOccurances(rawLink) || 0;

    const halfOccurrence = sharedIndex2().linkScoringOccurances();

    const scalingFactor = 1 / Math.log(2);

    const score = scalingFactor * Math.log(diff / halfOccurrence + 1)

    return Math.min(1, Math.max(score, this.minScore));
  };

  static scoreSearchInHref = (search: string, text: string): number => {
    const s = ScoringUtils.matchScore(search, text);
    if (s === 0) {
      return 0;
    }

    const ed = getLastEditedIndexed(text);
    const d = ed ? ScoringUtils.dateScore(ed) : ScoringUtils.minScore;
    const r = ed ? ScoringUtils.recentcyScore(ed) : ScoringUtils.minScore;
    let f = ScoringUtils.frequencyScore(text);
    f = f > ScoringUtils.minScore ? f : ScoringUtils.minScore

    return s * d * r * r * f;
  };

  static scoreSearchInLinks = (search: string, text: string): number => {
    const s = ScoringUtils.matchScore(search, text);
    if (s === 0) {
      return 0;
    }

    const ed = getLastEditedIndexed(text);
    const d = ed ? ScoringUtils.recentcyScore(ed) : ScoringUtils.minScore;
    let f = ScoringUtils.frequencyScore(search);
    f = f > ScoringUtils.minScore ? f : ScoringUtils.minScore
    return s * d * f;
  };

  static scoreAutocomplete = (search: string, match: string): number => {
    const s = ScoringUtils.matchScore(search, match);
    if (s < this.minScore) {
      return 0;
    }
    const ed = getLastEditedIndexed(match);
    const d = ed ? ScoringUtils.recentcyScore(ed) : ScoringUtils.minScore;
    let f = ScoringUtils.frequencyScore(match);
    f = f > ScoringUtils.minScore ? f : ScoringUtils.minScore
    return s * d * f;
  };

  static scoreAutocompleteParts = (search: string, match: string): number[] => {
    const s = ScoringUtils.matchScore(search, match);
    if (s === 0) {
      return [0, 0, 0, 0];
    }

    const minWeight = 0.75;
    const ed = getLastEditedIndexed(match);
    let d = ed ? ScoringUtils.recentcyScore(ed) : minWeight;
    d = Math.max(d, minWeight);
    let f = ScoringUtils.frequencyScore(match);
    f = Math.max(f, minWeight);
    return [s * d * f, s, d, f];
  };
}