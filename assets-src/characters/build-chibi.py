# Dựng lại apps/web/public/models/characters/chibi-girl.glb từ bản gốc (nhanvat/chibigirl.glb, Meshy):
#   blender -b --python assets-src/characters/build-chibi.py -- nhanvat/chibigirl.glb /tmp/girl-raw.glb 10000
#   npx gltf-transform optimize /tmp/girl-raw.glb apps/web/public/models/characters/chibi-girl.glb \
#     --compress meshopt --texture-compress webp --texture-size 1024 --no-simplify --flatten false --join false \
#     --instance false --palette false
# Tên node (upper, thighL/R, shinL/R) phải giữ nguyên: chibi3d.mjs dựa vào đó để gập chân.
#
# Chuẩn bị chibigirl.glb cho engine: quay mặt về −z (glTF), cao HEIGHT, chân chạm 0, giảm còn ~10k tam giác,
# tách thân trên / đùi / cẳng chân (không có khung xương) và chỉ giữ texture màu.
import bpy, bmesh, sys, mathutils, math, json
argv = sys.argv[sys.argv.index('--') + 1:]
src, out, target_tris = argv[0], argv[1], int(argv[2])
HEIGHT = 1.1
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
obj = [o for o in bpy.context.scene.objects if o.type == 'MESH'][0]
bpy.context.view_layer.objects.active = obj
obj.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
me = obj.data
# Quay 180° quanh Z: mặt trước (−Y trong Blender) thành +Y = −z khi xuất glTF.
me.transform(mathutils.Matrix.Rotation(math.pi, 4, 'Z'))
vs = [v.co for v in me.vertices]
zmin = min(v.z for v in vs); zmax = max(v.z for v in vs)
scale = HEIGHT / (zmax - zmin)
# Tâm thân theo hai chiếc giày (tóc xòe lệch nên không lấy tâm hộp bao).
shoe = [v for v in vs if v.z < zmin + 0.08 * (zmax - zmin)]
cx = (min(v.x for v in shoe) + max(v.x for v in shoe)) / 2
cy = (min(v.y for v in shoe) + max(v.y for v in shoe)) / 2
me.transform(mathutils.Matrix.Scale(scale, 4) @ mathutils.Matrix.Translation((-cx, -cy, -zmin)))
me.update()
# Giảm tam giác. Decimate làm rách đường nối UV của bản Meshy (texture hiện vệt trắng), nên trải UV mới rồi bake
# màu từ bản gốc sang ảnh 1024 mới (Cycles, Diffuse/Color, selected-to-active).
high = obj.copy(); high.data = obj.data.copy(); bpy.context.scene.collection.objects.link(high)
# Bản Meshy tách rời đỉnh theo từng mảnh UV: gộp đỉnh trùng trước, không thì Decimate/trải UV chạy trên từng
# mảnh vụn (mỗi tam giác một đảo UV → viền màu lem thành vệt trắng).
bpy.ops.object.select_all(action='DESELECT'); obj.select_set(True); bpy.context.view_layer.objects.active = obj
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.remove_doubles(threshold=0.0001)
bpy.ops.object.mode_set(mode='OBJECT')
me = obj.data
tris = sum(len(p.vertices) - 2 for p in me.polygons)
bpy.ops.object.select_all(action='DESELECT'); obj.select_set(True); bpy.context.view_layer.objects.active = obj
mod = obj.modifiers.new('dec', 'DECIMATE'); mod.ratio = target_tris / tris
bpy.ops.object.modifier_apply(modifier='dec')
print('TRIS', tris, '->', sum(len(p.vertices) - 2 for p in obj.data.polygons))
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.004)
bpy.ops.object.mode_set(mode='OBJECT')
image = bpy.data.images.new('chibi-bake', 1024, 1024)
mat = bpy.data.materials.new('chibi'); mat.use_nodes = True
nodes = mat.node_tree.nodes
bsdf = nodes['Principled BSDF']
tex = nodes.new('ShaderNodeTexImage'); tex.image = image
mat.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
bsdf.inputs['Metallic'].default_value = 0
bsdf.inputs['Roughness'].default_value = 0.8
obj.data.materials.clear(); obj.data.materials.append(mat)
nodes.active = tex
scene = bpy.context.scene
scene.render.engine = 'CYCLES'; scene.cycles.samples = 1; scene.cycles.device = 'CPU'
scene.render.bake.use_pass_direct = False; scene.render.bake.use_pass_indirect = False; scene.render.bake.use_pass_color = True
scene.render.bake.use_selected_to_active = True; scene.render.bake.cage_extrusion = 0.012; scene.render.bake.max_ray_distance = 0.03; scene.render.bake.margin = 6
bpy.ops.object.select_all(action='DESELECT'); high.select_set(True); obj.select_set(True); bpy.context.view_layer.objects.active = obj
bpy.ops.object.bake(type='DIFFUSE')
baked = argv[1] + '.png'
image.filepath_raw = baked; image.file_format = 'PNG'; image.save()
# Nạp lại ảnh từ file, không thì Blender xuất ảnh đóng gói cũ.
tex.image = bpy.data.images.load(baked)
bpy.data.objects.remove(high)
# Mốc khớp: đáy quần (hông) và gối, đo trên bản gốc (cao 1.9, đỉnh mũ 0.95) rồi đổi theo HEIGHT.
H = HEIGHT
crotch = (0.95 - 0.385) / 1.9 * H
knee = (0.95 - 0.57) / 1.9 * H
me = obj.data
bm = bmesh.new(); bm.from_mesh(me)
def centers(z0, z1):
    out = {}
    for side in (-1, 1):
        pts = [v.co for v in bm.verts if z0 <= v.co.z < z1 and v.co.x * side > 0.02]
        out[side] = (sum(p.x for p in pts) / len(pts), sum(p.y for p in pts) / len(pts))
    return out
legs = centers(knee * 0.6, crotch)
LEG_R = 0.17 * H / 1.1 * 1.0
groups = {'upper': []}
for side in (-1, 1):
    groups[f'thigh{side}'] = []; groups[f'shin{side}'] = []
for f in bm.faces:
    c = f.calc_center_median()
    part = 'upper'
    if c.z < crotch:
        side = -1 if c.x < 0 else 1
        lx, ly = legs[side]
        if math.hypot(c.x - lx, c.y - ly) < LEG_R or c.z < knee:
            part = f'thigh{side}' if c.z >= knee else f'shin{side}'
    groups[part].append(f.index)
bm.free()
joints = {'upper': (0, 0, crotch)}
for side in (-1, 1):
    lx, ly = legs[side]
    joints[f'thigh{side}'] = (lx, ly, crotch)
    joints[f'shin{side}'] = (lx, ly, knee)
names = {'upper': 'upper', 'thigh-1': 'thighR', 'thigh1': 'thighL', 'shin-1': 'shinR', 'shin1': 'shinL'}
parts = []
for key, faces in groups.items():
    bpy.ops.object.select_all(action='DESELECT')
    copy = obj.copy(); copy.data = obj.data.copy(); bpy.context.scene.collection.objects.link(copy)
    keep = set(faces)
    bm = bmesh.new(); bm.from_mesh(copy.data)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.index not in keep], context='FACES')
    bm.to_mesh(copy.data); bm.free()
    j = mathutils.Vector(joints[key])
    copy.data.transform(mathutils.Matrix.Translation(-j)); copy.location = j
    copy.name = copy.data.name = names[key]
    parts.append(copy)
    print('PART', names[key], len(keep), tuple(round(x, 4) for x in j))
bpy.data.objects.remove(obj)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_yup=True, export_apply=True)
