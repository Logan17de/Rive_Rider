from pathlib import Path

root = Path(__file__).resolve().parents[1] / ".rive-src"
path_h = root / "wasm/submodules/rive-runtime/include/rive/shapes/path.hpp"
bindings = root / "wasm/src/bindings.cpp"

# Expose the original path vertex array only in the existing tools/debug build.
s = path_h.read_text()
needle = "#ifdef ENABLE_QUERY_FLAT_VERTICES\n    FlattenedPath* makeFlat(bool transformToParent);\n#endif"
replacement = "#ifdef ENABLE_QUERY_FLAT_VERTICES\n    FlattenedPath* makeFlat(bool transformToParent);\n    const std::vector<PathVertex*>& queryVertices() const { return m_Vertices; }\n#endif"
if needle not in s:
    raise SystemExit("path.hpp patch point not found; upstream changed")
path_h.write_text(s.replace(needle, replacement, 1))

s = bindings.read_text()
needle = '''#ifdef ENABLE_QUERY_FLAT_VERTICES
        .function("flattenPath",
                  optional_override([](rive::Artboard& self,
                                       size_t index,
                                       bool transformToParent) -> rive::FlattenedPath* {
                      auto artboardObjects = self.objects();
                      if (index >= artboardObjects.size())
                      {
                          return nullptr;
                      }
                      auto object = artboardObjects[index];
                      if (!object->is<rive::Path>())
                      {
                          return nullptr;
                      }
                      auto path = object->as<rive::Path>();
                      return path->makeFlat(transformToParent);
                  }),
                  allow_raw_pointers())
#endif'''
replacement = '''#ifdef ENABLE_QUERY_FLAT_VERTICES
        .function("flattenPath",
                  optional_override([](rive::Artboard& self,
                                       size_t index,
                                       bool transformToParent) -> rive::FlattenedPath* {
                      auto artboardObjects = self.objects();
                      if (index >= artboardObjects.size()) return nullptr;
                      auto object = artboardObjects[index];
                      if (!object->is<rive::Path>()) return nullptr;
                      return object->as<rive::Path>()->makeFlat(transformToParent);
                  }),
                  allow_raw_pointers())
        .function("queryPathIndices",
                  optional_override([](rive::Artboard& self) -> emscripten::val {
                      auto out = emscripten::val::array();
                      auto objects = self.objects();
                      for (size_t i = 0; i < objects.size(); ++i)
                      {
                          if (objects[i]->is<rive::Path>()) out.call<void>("push", i);
                      }
                      return out;
                  }))
        .function("queryPathVertexCount",
                  optional_override([](rive::Artboard& self, size_t objectIndex) -> size_t {
                      auto objects = self.objects();
                      if (objectIndex >= objects.size() || !objects[objectIndex]->is<rive::Path>()) return 0;
                      return objects[objectIndex]->as<rive::Path>()->queryVertices().size();
                  }))
        .function("queryPathVertex",
                  optional_override([](rive::Artboard& self, size_t objectIndex, size_t vertexIndex) -> emscripten::val {
                      auto objects = self.objects();
                      if (objectIndex >= objects.size() || !objects[objectIndex]->is<rive::Path>()) return emscripten::val::null();
                      auto* path = objects[objectIndex]->as<rive::Path>();
                      const auto& vertices = path->queryVertices();
                      if (vertexIndex >= vertices.size()) return emscripten::val::null();
                      auto* vertex = vertices[vertexIndex];
                      auto out = emscripten::val::object();
                      out.set("x", vertex->x());
                      out.set("y", vertex->y());
                      out.set("coreType", vertex->coreType());
                      out.set("isCubic", vertex->is<rive::CubicVertex>());
                      if (vertex->is<rive::CubicVertex>())
                      {
                          auto* cubic = vertex->as<rive::CubicVertex>();
                          auto in = cubic->renderIn();
                          auto outHandle = cubic->renderOut();
                          out.set("inX", in[0]); out.set("inY", in[1]);
                          out.set("outX", outHandle[0]); out.set("outY", outHandle[1]);
                      }
                      return out;
                  }))
        .function("setPathVertexXY",
                  optional_override([](rive::Artboard& self, size_t objectIndex, size_t vertexIndex, float x, float y) -> bool {
                      auto objects = self.objects();
                      if (objectIndex >= objects.size() || !objects[objectIndex]->is<rive::Path>()) return false;
                      auto* path = objects[objectIndex]->as<rive::Path>();
                      const auto& vertices = path->queryVertices();
                      if (vertexIndex >= vertices.size()) return false;
                      vertices[vertexIndex]->x(x);
                      vertices[vertexIndex]->y(y);
                      path->markPathDirty();
                      return true;
                  }))
#endif'''
if needle not in s:
    raise SystemExit("bindings.cpp patch point not found; upstream changed")
bindings.write_text(s.replace(needle, replacement, 1))
print("Patched Rive tools bindings for path query + XY mutation")
