// jsdom has no 2D canvas backend. The atlas and sprite code is written to
// tolerate a missing context, so stub it out quietly rather than letting jsdom
// print a "not implemented" notice for every texture we build.
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement['getContext'];
}
