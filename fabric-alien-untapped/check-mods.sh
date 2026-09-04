#!/usr/bin/env bash
# Helper to validate the essential filenames for the Kilt-based Aliens Untapped setup.
# Usage: bash check-mods.sh [mods-folder]
set -u

DIR="${1:-mods}"
if [ ! -d "$DIR" ]; then
  echo "Directory not found: $DIR"
  exit 1
fi

# Each check is: label | glob pattern (relative to $DIR)
checks=(
  "Fabric API jar|fabric-api-*.jar"
  "Kilt 20.1.x|Kilt-20.1*.jar"
  "Forge Config API Port|ForgeConfigAPIPort-*.jar"
  "Alien Evolution Forge|AlienEvo-*-forge*.jar"
  "Aliens Untapped 1.3.x|AliensUntapped-1.3*.jar"
  "Palladium Forge|palladium-*-forge*.jar"
  "GeckoLib Forge|geckolib-*.jar"
  "KubeJS Forge|kubejs-*.jar"
  "Rhino Forge|rhino-*.jar"
  "Architectury Forge|architectury-*.jar"
  "Pehkui Forge|pehkui-*.jar"
  "Cardinal-Lib|Cardinal-Lib-*.jar"
)

fail=0
for entry in "${checks[@]}"; do
  label="${entry%%|*}"
  glob="${entry#*|}"
  matches=("$DIR"/$glob)
  if [ -e "${matches[0]}" ]; then
    printf 'PASS  %-28s (%s)\n' "$label" "$(basename "${matches[0]}")"
  else
    printf 'MISS  %-28s (expected %s)\n' "$label" "$glob"
    fail=1
  fi
done

echo
if [ "$fail" -eq 0 ]; then
  echo "All essential files look present. Launch Fabric 1.20.1 with Java 17+."
else
  echo "Some required files are missing or named differently. Add them before launching."
fi
exit $fail
