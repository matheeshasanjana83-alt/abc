# Aliens Untapped on Fabric 1.20.1 — Setup Guide

This folder explains the most practical way to make the Forge-only addon **Aliens Untapped 1.3.3**
work inside a **Fabric 1.20.1** install.

**Short answer:** it is not a real Fabric port. It is run through **Kilt**, a Fabric compatibility
layer that loads `(Neo)Forge` mods in a Fabric instance by remapping Forge's SRG classes and bridging
Forge APIs at runtime.

> ⚠️ Kilt is explicitly experimental. Mods that use coremods, deep rendering patches, or heavy
> script engines can still fail. Back up your world before using Kilt.

---

## 1. What you need

| Type | File / mod | Loader | Notes |
|---|---|---|---|
| Fabric loader | Fabric Loader **0.18.0+** | Fabric | Use the Fabric installer for Minecraft 1.20.1 |
| Fabric API | `fabric-api-0.92.7+1.20.1.jar` or newer | Fabric | Kilt 20.1.x requires at least this |
| Compatibility layer | **Kilt v20.1.20 (MC 1.20.1)** | Fabric | `Kilt-20.1.20.jar` / CurseForge “Kilt v20.1.20” |
| Forge config bridge | `ForgeConfigAPIPort-v8.0.3-1.20.1-Fabric.jar` | Fabric | Kilt requires Forge Config API Port >= 8.0.2 |
| Alien Evolution (Forge) | `AlienEvo-1.1.3-forge.jar` | Forge (loaded by Kilt) | Use the **Forge** build, not the Fabric one |
| Aliens Untapped (Forge) | `AliensUntapped-1.3.3.jar` | Forge (loaded by Kilt) | The file you linked |
| Palladium | `palladium-*.jar` (Forge/NeoForge 1.20.1) | Forge | Core mod for AlienEvo |
| GeckoLib | `geckolib-*.jar` (Forge 1.20.1) | Forge | Animations/models |
| KubeJS | `kubejs-*.jar` (Forge 1.20.1) | Forge | AlienEvo scripting |
| Rhino | `rhino-*.jar` (Forge 1.20.1) | Forge | JS runtime used by KubeJS |
| Architectury API | `architectury-*.jar` (Forge 1.20.1) | Forge | Cross-loader API |
| Pehkui | `pehkui-*.jar` (Forge 1.20.1) | Forge | Entity scaling |
| Cardinal-Lib | `Cardinal-Lib-1.0.0.jar` | Forge | Required by Aliens Untapped |

All the “Forge” mods above must be the **Forge 1.20.1 builds**. Even though you are launching Fabric,
Kilt is the thing that loads them.

---

## 2. Install steps

### Step 1 — Install Fabric 1.20.1
Install **Fabric Loader** for Minecraft `1.20.1` through the official Fabric installer.
Use Java 17 or newer.

### Step 2 — Create a fresh profile/mods folder (recommended)
Start with a new vanilla Fabric 1.20.1 profile and a clean `.minecraft/mods` folder.
Do not put these into an existing modpack first.

### Step 3 — Put these files in `mods/`

```
mods/
├── fabric-api-0.92.7+1.20.1.jar
├── Kilt-20.1.20.jar
├── ForgeConfigAPIPort-v8.0.3-1.20.1-Fabric.jar
├── AlienEvo-1.1.3-forge.jar
├── AliensUntapped-1.3.3.jar
├── palladium-4.5.6+1.20.1-forge.jar
├── geckolib-...-forge-1.20.1.jar
├── kubejs-...-forge-1.20.1.jar
├── rhino-...-forge-1.20.1.jar
├── architectury-...-forge-1.20.1.jar
├── pehkui-...-forge-1.20.1.jar
└── Cardinal-Lib-1.0.0.jar
```

Use the latest compatible **Forge 1.20.1** version of Palladium, GeckoLib, KubeJS, Rhino, Architectury,
and Pehkui.

### Step 4 — Launch the Fabric profile
Launch the Fabric 1.20.1 profile. Kilt should remap and load the Forge mods.

### Step 5 — Verify
- If the game starts and `Aliens Untapped` appears, both in Fabric Mod Menu and in the game's
  mod list, you're good.
- On a dedicated server, install exactly the same mods on the server. Kilt is client/server
  compatible, but content must be present on both sides.
- If it crashes, look at `logs/latest.log` and check for the first line mentioning `kilt`,
  `AlienEvo`, or `AliensUntapped`.

---

## 3. Useful links

- Kilt — https://modrinth.com/mod/kilt
- Kilt source — https://github.com/KiltMC/Kilt
- Alien Evolution — https://www.curseforge.com/minecraft/mc-mods/alienevo
- Aliens Untapped — https://www.curseforge.com/minecraft/mc-mods/aliens-untapped
- Palladium — https://www.curseforge.com/minecraft/mc-mods/threetag-palladium
- Cardinal-Lib — https://www.curseforge.com/minecraft/mc-mods/cardinal-lib

---

## 4. If Kilt does not load something

1. Check for **duplicate mod builds**: never have both the Fabric *and* Forge versions of AlienEvo in
   the mods folder.
2. Kilt needs `ForgeConfigAPIPort` and a recent Fabric API.
3. If KubeJS/Rhino fail, try the exact Forge 1.20.1 versions listed on KubeJS and Rhino pages.
4. You can run `bash check-mods.sh mods` once your file list is in place to validate the essential
   filenames.

---

## 5. If you see `no good? no, this man is definitely up to evil`

That line is a Kilt safety/refusal message. In most 1.20.1 setups it means Kilt noticed a mod it does
not want to load or a mod it cannot transform safely. Common causes and fixes:

1. **Remove cheat/dupe/exploit mods.**
   A Forge jar like `duper-1.0.0-forge-1.20.1.jar` is exactly the kind of thing that triggers this.
   Delete it and any other `*duper*`, `*dupe*`, or suspicious utility mods from `mods/`.

2. **Test with the absolute minimum mod list.**
   Do not test Kilt with 200+ mods. Use `mods-minimal.txt` in this folder as the checklist. Once
   Aliens Untapped loads, add your other mods back in small groups.

3. **Remove agent / ASM-Fabric-Loader-based mods.**
   Libraries such as `net_lostluma_battery` (Battery), `Dynamic FPS`, and anything built on
   ASM Fabric Loader can conflict with Kilt's remapping/agent setup. Remove them while testing.

4. **Never mix Forge and Fabric builds for Kilt content.**
   Use the **Forge 1.20.1** version of AlienEvo, Palladium, GeckoLib, KubeJS, Rhino, Architectury,
   Pehkui, and Cardinal-Lib. The addon has to see Forge versions.

5. **Check the exact Kilt version.**
   Use `Kilt v20.1.20 (MC 1.20.1)` and Fabric Loader 0.18.0 or newer.
   `ForgeConfigAPIPort` must be the Fabric 1.20.1 build.

---

## 6. Important honesty note

This is **not** a native Fabric port of Aliens Untapped. The addon is All Rights Reserved and no
public source is available, so a true port is not something that can be made from just the jar.

Kilt is the only realistic path to run this Forge addon on Fabric 1.20.1 today. It is experimental,
but it is the option used for many Forge-only mods inside Fabric packs.
