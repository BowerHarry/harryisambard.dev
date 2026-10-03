import { useEffect } from 'react';
import { FloatingPortal } from '@floating-ui/react';
import type { Photo } from './photo-types';

/** The full-screen view of one set, on one photo at a time. */
export default function PhotoGallery({
	photos,
	index,
	onStep,
	onClose,
}: {
	photos: Photo[];
	index: number;
	/** Move on by this many photos; PhotoLayer keeps the index within the set. */
	onStep: (delta: number) => void;
	onClose: () => void;
}) {
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') onClose();
			if (event.key === 'ArrowRight') onStep(1);
			if (event.key === 'ArrowLeft') onStep(-1);
		};

		document.addEventListener('keydown', onKeyDown);
		// The document pane is the scroller, not <body>; terminal.css freezes it
		// off this class so the page doesn't scroll behind the gallery.
		document.documentElement.classList.add('is-overlaid');
		return () => {
			document.removeEventListener('keydown', onKeyDown);
			document.documentElement.classList.remove('is-overlaid');
		};
	}, [onStep, onClose]);

	const current = photos[index];
	if (!current) return null;

	return (
		<FloatingPortal>
			<div
				className="photo-gallery"
				onClick={(event) => {
					if (event.target === event.currentTarget) onClose();
				}}
			>
				<figure>
					<img
						src={current.full.src}
						alt={current.alt}
						width={current.full.width}
						height={current.full.height}
					/>
					<figcaption>{current.alt}</figcaption>
				</figure>
				<p className="photo-hint">
					<kbd>esc</kbd> close
					{photos.length > 1 && (
						<>
							{" · "}
							<kbd>←/→</kbd> browse {index + 1}/{photos.length}
						</>
					)}
				</p>
			</div>
		</FloatingPortal>
	);
}
