# DragonMounts2 → Fabric / Minecraft 1.21.1 port

This folder is a work-in-progress Fabric **1.21.1** port of **Dragon Mounts 2** from the official
`DragonMounts-Team/NeoDragonMounts` source (which currently targets NeoForge + Fabric 1.21.4).

- Upstream source: https://github.com/DragonMounts-Team/NeoDragonMounts
- License: GPL-3.0 (see `LICENSE`)
- Original target of the `.jar` in the request: `DragonMounts2-1.12.2-2.1.2.jar` (Forge 1.12.2)

A Forge 1.12.2 mod cannot be “converted” to a Fabric 1.21.1 jar directly. The practical path is to
backport the modern official source, and that is what this tree is doing.

## What has been changed so far

- `gradle.properties` now points at:
  - Minecraft `1.21.1`
  - NeoForm `1.21.1-20240808.144430`
  - Parchment `1.21.1` / `2024.11.17`
  - Fabric API `0.114.0+1.21.1`
  - Fabric Loader `0.16.9`
  - Mod Menu `11.0.3`
- The main 1.21.2+ “entity render state” client code was reverted to the 1.21.1 direct-entity renderer
  model:
  - `DragonRenderState` is now a plain per-entity animation snapshot (no MC render-state base class).
  - `DragonModel` is `EntityModel<ClientDragonEntity>` again.
  - `DragonAnimator` now snapshots data from the live `ClientDragonEntity`.
  - `TameableDragonRenderer`, `TameableDragonLayer`, `DragonEggRenderer` render entities directly.
  - The head-item mixin now works against the 1.21.1 `CustomHeadLayer.render(LivingEntity, ...)`.
- Removed `LivingEntityRenderStateMixin` / `LivingEntityRendererMixin` and dropped the 1.21.2+ special
  block/item renderer registrations (`SpecialModelRenderers`, `SpecialBlockRendererRegistry`).
- `DragonHeadBlock.neighborChanged` was changed to the pre-1.21.2 signature.

## Known remaining 1.21.1 compatibility work

This is NOT yet a complete buildable jar. The code still contains APIs that were introduced after
1.21.1 and must be rewritten or removed before `./gradlew :fabric:build` succeeds:

1. **Equipment / armor assets**
   - `EquipmentAsset`, `EquipmentAssets.ROOT_ID`, and `Equippable.assetId()` do not exist in 1.21.1.
   - Files to rewrite: `DragonArmorMaterials`, `ArmorMaterialBuilder`, `DragonType`, `DefaultAppearance`,
     `VariantAppearance`, `DragonScaleShieldItem`, `DMEquipmentAssetProvider`, `DMDataGenerator`.
   - 1.21.1 uses the older armour-model/`Equippable.model(ResourceLocation)` style.

2. **Scoreboard internals**
   - `PlayerScores`, `ScoreboardMixin`, `ScoreboardInfo`, `ScoreboardAccessor` target APIs added in
     1.21.2+.
   - Needs a 1.21.1 scoreboard implementation or the dragon-score feature should be removed for now.

3. **Trial spawner internals**
   - `TrialSpawnerMixin` / `TrialSpawnerExtension` must be checked against the 1.21.1
     `TrialSpawner`/`TrialSpawnerData` API.

4. **Data generation / item models**
   - `DMDataGenerator`, `DMEquipmentAssetProvider`, `DMModelProvider` etc. may need reworking for the
     1.21.1 model/equipment APIs.

5. **Block/entity API drift**
   - `DragonCoreBlock`, `DragonHeadBlockEntity`, `BlockEntityRenderers`, `TrialSpawnerData`, etc. must be
     diffed against 1.21.1.

6. **Fabric API / mixin signatures**
   - Some mixins target 1.21.2+ methods (e.g. `LivingEntityRenderer`, `GuiGraphics`, `CoreShaders`).
   - Run the client/server in a dev environment before shipping.

## Build

Requires JDK 21 + network access to Maven (Fabric, NeoForge, Parchment).

```sh
cd dragonmounts2-fabric
./gradlew :fabric:build
```

The resulting Fabric jar is produced under `fabric/build/libs/`.

## Why no prebuilt jar is attached in this sandbox

The arena sandbox used for this session has no installed JDK/Gradle and outbound Maven access is
restricted, so the source could not be compiled or launched here. The work is intended to be built by
the maintainer in a normal modding environment using the steps above.
