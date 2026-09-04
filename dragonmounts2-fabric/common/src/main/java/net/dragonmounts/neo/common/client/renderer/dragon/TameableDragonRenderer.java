package net.dragonmounts.neo.common.client.renderer.dragon;

import com.mojang.blaze3d.vertex.PoseStack;
import net.dragonmounts.neo.common.client.ClientDragonEntity;
import net.dragonmounts.neo.common.client.model.dragon.BuiltinFactory;
import net.dragonmounts.neo.common.client.model.dragon.DragonModel;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.RenderType;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.MobRenderer;
import net.minecraft.resources.ResourceLocation;
import org.jetbrains.annotations.Nullable;

import static net.minecraft.client.renderer.entity.EnderDragonRenderer.renderCrystalBeams;

public class TameableDragonRenderer extends MobRenderer<ClientDragonEntity, DragonModel> {
    private float partialTick;

    public TameableDragonRenderer(EntityRendererProvider.Context context) {
        super(context, new DragonModel(context.getModelSet().bakeLayer(BuiltinFactory.NORMAL.location)), 2);
        this.addLayer(new TameableDragonLayer(this));
    }

    @Override
    public void render(ClientDragonEntity entity, float yRot, float partialTick, PoseStack matrices, MultiBufferSource buffers, int light) {
        this.partialTick = partialTick;
        var state = entity.animator.renderState;
        if (state.renderCrystalBeams && state.crystal != null) {
            matrices.pushPose();
            var crystal = state.crystal;
            renderCrystalBeams(
                    crystal.x - entity.getX(),
                    crystal.y - entity.getY(),
                    crystal.z - entity.getZ(),
                    state.ageInTicks,
                    matrices,
                    buffers,
                    light
            );
            matrices.popPose();
        }
        super.render(entity, yRot, partialTick, matrices, buffers, light);
    }

    @Override
    protected void setupAnim(ClientDragonEntity entity, float limbSwing, float limbSwingAmount, float ageInTicks, float netHeadYaw, float headPitch) {
        entity.animator.apply(entity, this.partialTick, limbSwing, limbSwingAmount, ageInTicks, netHeadYaw, headPitch);
        ((DragonModel) this.model).setupAnimState(entity.animator.renderState);
    }

    @Override
    protected void scale(ClientDragonEntity entity, PoseStack matrices) {
        super.scale(entity, matrices);
        var state = entity.animator.renderState;
        float scale = state.ageScale;
        matrices.scale(scale, scale, scale);
        matrices.translate(0.0F, state.offsetY, -1.5F);
    }

    @Override
    public ResourceLocation getTextureLocation(ClientDragonEntity entity) {
        return entity.animator.renderState.variant.appearance.getBodyTexture(entity.animator.renderState);
    }

    @Override
    protected @Nullable RenderType getRenderType(ClientDragonEntity entity, boolean visible, boolean translucent, boolean glowing) {
        // During death, do not use the standard rendering and let the death layer handle it. Hacky, but better than mixins.
        return entity.animator.renderState.deathTime > 0 ? null : super.getRenderType(entity, visible, translucent, glowing);
    }

    @Override
    protected float getFlipDegrees() {
        return 0.0F; // dragons dissolve during death, not flip.
    }
}
