#!/usr/bin/env python3
"""Patch a rive-wasm checkout with geometry inspection/mutation bindings.

The official `tools` WASM build already enables ENABLE_QUERY_FLAT_VERTICES.
This patch additionally exposes the original Path::vertices collection and a
small Artboard debug API so Rive Rider can enumerate .riv objects and mutate
real path vertex x/y values.

Pinned to the Rive WASM revision in build-custom-rive.sh. Fail loudly if the
expected source anchors change.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHECKOUT = ROOT / ".rive-wasm"
BINDINGS = CHECKOUT / "wasm" / "src" / "bindings.cpp"
PATH_HPP = CHECKOUT / "wasm" / "submodules" / "rive-runtime" / "include" / "rive" / "shapes" / "path.hpp"


def replace_once(path: Path, old: str, new: str) -> None:
    text = path.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"Patch anchor not found in {path}:\n{old[:240]}")
    if text.count(old) != 1:
        raise SystemExit(f"Patch anchor occurs {text.count(old)} times in {path}; refusing ambiguous patch")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")


# The runtime keeps mutable path vertices private except in TESTING builds.
# Expose the existing accessor in the tools/query build too.
replace_once(
    PATH_HPP,
    """#ifdef TESTING\n    std::vector<PathVertex*>& vertices() { return m_Vertices; }\n#endif""",
    """#if defined(TESTING) || defined(ENABLE_QUERY_FLAT_VERTICES)\n    // Rive Rider tools build only: expose original mutable vertices.\n    std::vector<PathVertex*>& vertices() { return m_Vertices; }\n    const std::vector<PathVertex*>& vertices() const { return m_Vertices; }\n#endif""",
)

# We want to report the owning Shape's editor name for otherwise-anonymous
# Path objects (e.g. R_Eye, Face, Mouth).
replace_once(
    BINDINGS,
    '#include "rive/shapes/path.hpp"\n',
    '#include "rive/shapes/path.hpp"\n#include "rive/shapes/shape.hpp"\n',
)

# Extend the existing tools-only Artboard section. We deliberately operate by
# object index because the public runtime does not expose full hierarchy
# traversal. The object index is stable for the loaded Artboard instance.
anchor = """#ifdef ENABLE_QUERY_FLAT_VERTICES\n        .function(\"flattenPath\","""
if anchor not in BINDINGS.read_text(encoding="utf-8"):
    raise SystemExit("Expected ENABLE_QUERY_FLAT_VERTICES Artboard anchor not found")

insert = r'''#ifdef ENABLE_QUERY_FLAT_VERTICES
        .function("debugObjectCount",
                  optional_override([](rive::ArtboardInstance& self) -> size_t {
                      return self.objects().size();
                  }))
        .function("debugObjectInfo",
                  optional_override([](rive::ArtboardInstance& self,
                                       size_t index) -> emscripten::val {
                      const auto& objects = self.objects();
                      if (index >= objects.size())
                      {
                          return emscripten::val::null();
                      }
                      rive::Core* object = objects[index];
                      emscripten::val result = emscripten::val::object();
                      result.set("index", index);
                      result.set("typeKey", object->coreType());
                      result.set("isPath", object->is<rive::Path>());
                      result.set("isComponent", object->is<rive::Component>());
                      if (object->is<rive::Component>())
                      {
                          result.set("name", object->as<rive::Component>()->name());
                      }
                      else
                      {
                          result.set("name", "");
                      }
                      if (object->is<rive::Path>())
                      {
                          auto* path = object->as<rive::Path>();
                          auto* shape = path->shape();
                          result.set("shapeName", shape == nullptr ? "" : shape->name());
                          result.set("hidden", path->isHidden());
                          result.set("collapsed", path->isCollapsed());
                      }
                      return result;
                  }))
        .function("debugPathVertexCount",
                  optional_override([](rive::ArtboardInstance& self,
                                       size_t objectIndex) -> size_t {
                      const auto& objects = self.objects();
                      if (objectIndex >= objects.size() ||
                          !objects[objectIndex]->is<rive::Path>())
                      {
                          return 0;
                      }
                      return objects[objectIndex]->as<rive::Path>()->vertices().size();
                  }))
        .function("debugPathVertexInfo",
                  optional_override([](rive::ArtboardInstance& self,
                                       size_t objectIndex,
                                       size_t vertexIndex) -> emscripten::val {
                      const auto& objects = self.objects();
                      if (objectIndex >= objects.size() ||
                          !objects[objectIndex]->is<rive::Path>())
                      {
                          return emscripten::val::null();
                      }
                      auto* path = objects[objectIndex]->as<rive::Path>();
                      auto& vertices = path->vertices();
                      if (vertexIndex >= vertices.size())
                      {
                          return emscripten::val::null();
                      }
                      auto* vertex = vertices[vertexIndex];
                      auto renderPoint = vertex->renderTranslation();
                      emscripten::val result = emscripten::val::object();
                      result.set("index", vertexIndex);
                      result.set("x", vertex->x());
                      result.set("y", vertex->y());
                      result.set("renderX", renderPoint[0]);
                      result.set("renderY", renderPoint[1]);
                      result.set("hasWeight", vertex->hasWeight());
                      const bool cubic = vertex->is<rive::CubicVertex>();
                      result.set("isCubic", cubic);
                      if (cubic)
                      {
                          auto* cubicVertex = vertex->as<rive::CubicVertex>();
                          auto inPoint = cubicVertex->renderIn();
                          auto outPoint = cubicVertex->renderOut();
                          result.set("inX", inPoint[0]);
                          result.set("inY", inPoint[1]);
                          result.set("outX", outPoint[0]);
                          result.set("outY", outPoint[1]);
                      }
                      return result;
                  }))
        .function("debugSetPathVertexXY",
                  optional_override([](rive::ArtboardInstance& self,
                                       size_t objectIndex,
                                       size_t vertexIndex,
                                       float x,
                                       float y) -> bool {
                      const auto& objects = self.objects();
                      if (objectIndex >= objects.size() ||
                          !objects[objectIndex]->is<rive::Path>())
                      {
                          return false;
                      }
                      auto* path = objects[objectIndex]->as<rive::Path>();
                      auto& vertices = path->vertices();
                      if (vertexIndex >= vertices.size())
                      {
                          return false;
                      }
                      auto* vertex = vertices[vertexIndex];
                      vertex->x(x);
                      vertex->y(y);

                      // x()/y() already dirties the owning path through
                      // Vertex::markGeometryDirty(). Explicitly mark once more
                      // and immediately run Rive's dependency DAG so skinned
                      // vertices, path composers, and render paths are rebuilt
                      // before JavaScript reads/draws the result.
                      path->markPathDirty();
                      self.updateComponents();
                      self.changed();
                      return true;
                  }))
        .function("flattenPath",'''

replace_once(BINDINGS, anchor, insert)
print("Patched Rive runtime and WASM bindings for Rive Rider geometry access.")
