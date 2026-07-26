/**
 * Whether something modal is on screen — the photo gallery or the help panel.
 *
 * The view scripts consult this before acting on a key, so one Escape doesn't
 * both dismiss an overlay and trigger the view underneath it. The hover popup
 * deliberately doesn't count: it isn't modal, and dismisses itself.
 */
export const overlayOpen = () =>
	Boolean(document.querySelector('.photo-gallery, .help:not([hidden])'));
