package net.dragonmounts.neo.common.client.renderer.egg;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.SheetedDecalTextureGenerator;
import com.mojang.blaze3d.vertex.VertexMultiConsumer;
import net.dragonmounts.neo.common.entity.dragon.HatchableDragonEggEntity;
import net.dragonmounts.neo.common.init.DMBlocks;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.block.BlockRenderDispatcher;
import net.minecraft.client.renderer.entity.EntityRenderer;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.client.resources.model.ModelBakery;
import net.minecraft.util.Mth;
import org.joml.Quaternionf;

import static net.dragonmounts.neo.common.entity.dragon.HatchableDragonEggEntity.EGG_CRACK_THRESHOLD;
import static net.dragonmounts.neo.common.util.math.MathUtil.HALF_RAD_FACTOR;

/// @see net.minecraft.client.renderer.entity.FallingBlockRenderer
public class DragonEggRenderer extends EntityRenderer<HatchableDragonEggEntity> {
    /// Textures from 0 to 8 (inclusive) indicate unhatchable and the last one (9) indicates hatchable.
    protected final static float CRACK_PROGRESS_TO_STAGE = (ModelBakery.DESTROY_STAGE_COUNT - 1) / (1.0F - EGG_CRACK_THRESHOLD);
    protected final BlockRenderDispatcher dispatcher;

    public DragonEggRenderer(EntityRendererProvider.Context context) {
        super(context);
        this.dispatcher = context.getBlockRenderDispatcher();
    }

    @Override
    public void render(HatchableDragonEggEntity egg, float yRot, float partialTicks, PoseStack matrices, MultiBufferSource buffers, int light) {
        float progress = egg.getIncubationProgress();
        var block = egg.asBlock(DMBlocks.ENDER_DRAGON_EGG.get()).defaultBlockState();
        float amplitude = egg.getAmplitude(partialTicks);
        float axis = 0.0F;

        matrices.pushPose();
        if (amplitude != 0.0F) {
            axis = egg.getWobbleAxis();
            amplitude *= HALF_RAD_FACTOR;
            float sin = Mth.sin(amplitude);
            matrices.mulPose(new Quaternionf(
                    Mth.cos(axis) * sin,
                    0.0F,
                    Mth.sin(axis) * sin,
                    Mth.cos(amplitude)
            ));
        }
        matrices.translate(-0.5, 0.0, -0.5);
        if (progress < EGG_CRACK_THRESHOLD) {
            this.dispatcher.renderSingleBlock(block, matrices, buffers, light, OverlayTexture.NO_OVERLAY);
        } else {
            var generator = new SheetedDecalTextureGenerator(Minecraft.getInstance().renderBuffers().crumblingBufferSource().getBuffer(
                    ModelBakery.DESTROY_TYPES.get(Math.min((int) ((progress - EGG_CRACK_THRESHOLD) * CRACK_PROGRESS_TO_STAGE), 9))
            ), matrices.last(), 1.0F);
            this.dispatcher.renderSingleBlock(block, matrices, type -> {
                var buffer = buffers.getBuffer(type);
                return type.affectsCrumbling() ? VertexMultiConsumer.create(generator, buffer) : buffer;
            }, light, OverlayTexture.NO_OVERLAY);
        }
        super.render(egg, yRot, partialTicks, matrices, buffers, light);
        matrices.popPose();
    }
}
