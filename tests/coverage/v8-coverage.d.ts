declare module '@bcoe/v8-coverage' {
  interface ProcessCoverage {
    result: import('node:inspector').Profiler.ScriptCoverage[];
  }

  export function mergeProcessCovs(processCoverages: ProcessCoverage[]): ProcessCoverage;
}
