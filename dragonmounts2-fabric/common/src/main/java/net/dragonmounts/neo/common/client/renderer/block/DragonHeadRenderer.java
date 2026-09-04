package net.dragonmounts.neo.common.client.renderer.block;

import com.mojang.blaze3d.vertex.PoseStack;
import net.dragonmounts.neo.common.block.DragonHeadBlock;
import net.dragonmounts.neo.common.block.entity.DragonHeadBlockEntity;
import net.dragonmounts.neo.common.client.variant.VariantAppearance;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.renderer.LightTexture;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.blockentity.BlockEntityRenderer;
import net.minecraft.client.renderer.blockentity.BlockEntityRendererProvider;
import net.minecraft.client.renderer.texture.OverlayTexture;
import org.jetbrains.annotations.NotNullByDefault;

import static net.minecraft.world.level.block.state.properties.BlockStateProperties.HORIZONTAL_FACING;

@SuppressWarnings("UnstableApiUsage")
@NotNullByDefault
public enum DragonHeadRenderer implements BlockEntityRenderer<DragonHeadBlockEntity>, BlockEntityRendererProvider<DragonHeadBlockEntity> {
    INSTANCE;

    public static void renderHead(
            ModelPart head,
            VariantAppearance appearance,
            PoseStack matrices,
            MultiBufferSource buffers,
            double offsetX,
            double offsetY,
            double offsetZ,
            int light,
            int overlay
    ) {
        matrices.pushPose();
        matrices.translate(offsetX, offsetY, offsetZ);
        matrices.scale(-1.0F, -1.0F, 1.0F);
        head.render(matrices, buffers.getBuffer(appearance.getBase(null)), light, overlay, -1);
        head.render(matrices, buffers.getBuffer(appearance.getGlow(null)), LightTexture.FULL_BLOCK, OverlayTexture.NO_OVERLAY, -1);
        matrices.popPose();
    }

    @Override
    public void render(DragonHeadBlockEntity entity, float partialTick, PoseStack matrices, MultiBufferSource buffers, int light, int overlay) {
        var state = entity.getBlockState();
        if (state.getBlock() instanceof DragonHeadBlock head) {
            var appearance = head.variant.appearance;
            var model = appearance.getModel(null);
            if (model == null) return;
            model.setupBlock(entity.getAnimation(partialTick), head.getYRotation(state), 0.75F);
            if (head.isOnWall) {
                var direction = state.getValue(HORIZONTAL_FACING);
                renderHead(
                        model.head,
                        appearance,
                        matrices,
                        buffers,
                        0.5 - direction.getStepX() * 0.25,
                        0.25,
                        0.5 - direction.getStepZ() * 0.25,
                        light,
                        overlay
                );
            } else {
                renderHead(
                        model.head,
                        appearance,
                        matrices,
                        buffers,
                        0.5,
                        0.0,
                        0.5,
                        light,
                        overlay
                );
            }
        }
    }

    @Override
    public BlockEntityRenderer<DragonHeadBlockEntity> create(Context context) {
        return this;
    }
}
