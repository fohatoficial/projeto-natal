import type { Movie } from "@/lib/pipoca/movies";

type Props = {
  movie: Movie;
  onChoose?: (movie: Movie) => void;
  ctaLabel?: string;
};

export function MovieCard({ movie, onChoose, ctaLabel = "Escolher este filme" }: Props) {
  return (
    <article className="tb-card bg-card overflow-hidden flex flex-col w-full max-w-md mx-auto shadow-2xl">
      <div className="relative aspect-[3/4] w-full overflow-hidden film-grain vignette">
        <img
          src={movie.posterUrl}
          alt={movie.title}
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-5">
          <h3 className="font-display text-3xl leading-none text-white">
            {movie.title}
          </h3>
        </div>
      </div>

      <div className="p-6 flex flex-col gap-5">
        <p className="text-sm leading-relaxed text-white/75">
          {movie.cardDescription}
        </p>
        {onChoose ? (
          <button
            onClick={() => onChoose(movie)}
            className="w-full bg-gold text-cinema font-semibold tracking-wide rounded-md py-4 text-sm uppercase hover:brightness-110 active:scale-[0.99] transition"
          >
            {ctaLabel}
          </button>
        ) : null}
      </div>
    </article>
  );
}
