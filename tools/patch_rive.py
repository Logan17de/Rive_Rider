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
BUILD_WASM = CHECKOUT / "wasm" / "build_wasm.sh"
DEPENDENCY_LUA = CHECKOUT / "wasm" / "submodules" / "rive-runtime" / "build" / "dependency.lua"
RIVE_BUILD_CONFIG = CHECKOUT / "wasm" / "submodules" / "rive-runtime" / "build" / "rive_build_config.lua"
PATH_HPP = CHECKOUT / "wasm" / "submodules" / "rive-runtime" / "include" / "rive" / "shapes" / "path.hpp"
PREMAKE_LUA = CHECKOUT / "wasm" / "premake5.lua"


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

# The bindings need the concrete path classes for reliable type checks and the
# owning Shape for useful hierarchy/visibility diagnostics.
replace_once(
    BINDINGS,
    """#include \"rive/shapes/cubic_vertex.hpp\"\n#include \"rive/shapes/path.hpp\"""",
    """#include \"rive/shapes/cubic_vertex.hpp\"\n#include \"rive/shapes/ellipse.hpp\"\n#include \"rive/shapes/list_path.hpp\"\n#include \"rive/shapes/parametric_path.hpp\"\n#include \"rive/shapes/path.hpp\"\n#include \"rive/shapes/points_path.hpp\"\n#include \"rive/shapes/polygon.hpp\"\n#include \"rive/shapes/rectangle.hpp\"\n#include \"rive/shapes/shape.hpp\"\n#include \"rive/shapes/star.hpp\"\n#include \"rive/shapes/triangle.hpp\"""",
)

replace_once(
    BINDINGS,
    "#include <iomanip>\n#include <sstream>",
    "#include <cmath>\n#include <iomanip>\n#include <limits>\n#include <sstream>",
)

# The upstream tools invocation expands an absolute Premake path. Quote it so
# checkouts living below a directory with spaces (including this workspace)
# remain buildable in Linux/WSL.
replace_once(
    BUILD_WASM,
    "$PREMAKE gmake2 $PREMAKE_FLAGS && CFLAGS=-DENABLE_QUERY_FLAT_VERTICES CXXFLAGS=-DENABLE_QUERY_FLAT_VERTICES make -C $OUT_DIR -j$NCPU",
    '"$PREMAKE" gmake2 $PREMAKE_FLAGS && CFLAGS=-DENABLE_QUERY_FLAT_VERTICES CXXFLAGS=-DENABLE_QUERY_FLAT_VERTICES make -C $OUT_DIR -j$NCPU',
)

# Premake invokes this command through cmd.exe on Windows. Quote the absolute
# dependency directory so a repository below a path such as "Logan De" works.
replace_once(
    DEPENDENCY_LUA,
    """local gitcmd = 'git -c advice.detachedHead=false -C '
            .. dependencies
            .. ' clone --depth 1 --branch '
            .. tag
            .. ' https://github.com/'
            .. project
            .. '.git'
            .. ' '
            .. dirname""",
    """local gitcmd = 'git -c advice.detachedHead=false -C '
            .. string.format('%q', dependencies)
            .. ' clone --depth 1 --branch '
            .. string.format('%q', tag)
            .. ' https://github.com/'
            .. project
            .. '.git'
            .. ' '
            .. string.format('%q', dirname)""",
)

# Ninja does not consume shell CFLAGS the same way GNU Make does. Give the
# native Windows build an explicit, opt-in Premake define while leaving the
# existing Linux tools build unchanged.
replace_once(
    PREMAKE_LUA,
    "dofile('rive_build_config.lua')",
    """dofile('rive_build_config.lua')

if os.getenv('RIVE_RIDER_ENABLE_QUERY_FLAT_VERTICES') == '1' then
    defines({ 'ENABLE_QUERY_FLAT_VERTICES' })
end""",
)

# The pinned WASM Premake file puts absolute pre-js/output paths directly in
# link options. Quote those values so a native Windows checkout below a user
# directory containing spaces survives the final Emscripten link command.
for unquoted, quoted in (
    (
        "'--pre-js ' .. path.getabsolute('./js/animation_callback_handler.js')",
        """'--pre-js "' .. path.getabsolute('./js/animation_callback_handler.js') .. '"'""",
    ),
    (
        "'--pre-js ' .. path.getabsolute('./js/max_recent_size.js')",
        """'--pre-js "' .. path.getabsolute('./js/max_recent_size.js') .. '"'""",
    ),
    (
        "'--pre-js ' .. path.getabsolute('./js/shared.js')",
        """'--pre-js "' .. path.getabsolute('./js/shared.js') .. '"'""",
    ),
    (
        "'--pre-js ' .. path.getabsolute('./js/renderer.js')",
        """'--pre-js "' .. path.getabsolute('./js/renderer.js') .. '"'""",
    ),
    (
        "'-o ' .. path.getabsolute(RIVE_BUILD_OUT) .. '/canvas_advanced.mjs'",
        """'-o "' .. path.getabsolute(RIVE_BUILD_OUT) .. '/canvas_advanced.mjs"'""",
    ),
    (
        "'-o ' .. path.getabsolute(RIVE_BUILD_OUT) .. '/canvas_advanced_single.mjs'",
        """'-o "' .. path.getabsolute(RIVE_BUILD_OUT) .. '/canvas_advanced_single.mjs"'""",
    ),
    (
        "'--pre-js ' .. path.getabsolute('./js/webgl2_renderer.js')",
        """'--pre-js "' .. path.getabsolute('./js/webgl2_renderer.js') .. '"'""",
    ),
    (
        "'-o ' .. path.getabsolute(RIVE_BUILD_OUT) .. '/webgl2_advanced.mjs'",
        """'-o "' .. path.getabsolute(RIVE_BUILD_OUT) .. '/webgl2_advanced.mjs"'""",
    ),
):
    replace_once(PREMAKE_LUA, unquoted, quoted)

# Ninja launches simple commands directly with CreateProcess on Windows, where
# a python3.cmd PATH shim is not considered before python3.exe. Use the native
# interpreter path exported by emsdk instead of the Microsoft Store alias.
replace_once(
    RIVE_BUILD_CONFIG,
    '''        local emsdk_dir = os.getenv('EMSDK'):gsub("/", "\\\\")
        local emsdk_tools_dir = emsdk_dir .. "\\\\upstream\\\\emscripten\\\\"
        for key, value in pairs(emsdk_tools) do
            emsdk_tools[key] = "python3 " .. emsdk_tools_dir .. value .. ".py"
        end''',
    '''        local emsdk_dir = os.getenv('EMSDK'):gsub("/", "\\\\")
        local emsdk_python = os.getenv('EMSDK_PYTHON')
        if emsdk_python == nil or emsdk_python == '' then
            error('EMSDK_PYTHON must name a native Windows Python interpreter')
        end
        local emsdk_tools_dir = emsdk_dir .. "\\\\upstream\\\\emscripten\\\\"
        for key, value in pairs(emsdk_tools) do
            emsdk_tools[key] = '"' .. emsdk_python .. '" "' .. emsdk_tools_dir .. value .. '.py"'
        end''',
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
                      if (index >= objects.size() || objects[index] == nullptr)
                      {
                          return emscripten::val::null();
                      }
                      rive::Core* object = objects[index];
                      const bool isPath = object->is<rive::Path>();
                      const bool isPointsPath = object->is<rive::PointsPath>();
                      const bool isParametricPath =
                          object->is<rive::ParametricPath>();
                      const bool isListPath = object->is<rive::ListPath>();
                      std::string concreteType = "Core";
                      if (isPointsPath)
                      {
                          concreteType = "PointsPath";
                      }
                      else if (object->is<rive::Rectangle>())
                      {
                          concreteType = "Rectangle";
                      }
                      else if (object->is<rive::Ellipse>())
                      {
                          concreteType = "Ellipse";
                      }
                      else if (object->is<rive::Star>())
                      {
                          concreteType = "Star";
                      }
                      else if (object->is<rive::Polygon>())
                      {
                          concreteType = "Polygon";
                      }
                      else if (object->is<rive::Triangle>())
                      {
                          concreteType = "Triangle";
                      }
                      else if (isListPath)
                      {
                          concreteType = "ListPath";
                      }
                      else if (isParametricPath)
                      {
                          concreteType = "ParametricPath";
                      }
                      else if (isPath)
                      {
                          concreteType = "Path";
                      }

                      emscripten::val result = emscripten::val::object();
                      result.set("index", index);
                      result.set("typeKey", object->coreType());
                      result.set("concreteType", concreteType);
                      result.set("isPath", isPath);
                      result.set("isPointsPath", isPointsPath);
                      result.set("isParametricPath", isParametricPath);
                      result.set("isComponent", object->is<rive::Component>());
                      result.set("name", "");
                      result.set("parentName", "");
                      result.set("parentIndex", -1);
                      result.set("shapeName", "");
                      result.set("shapeIndex", -1);
                      result.set("hidden", false);
                      result.set("collapsed", false);
                      result.set("vertexCount", 0);
                      result.set("generatedVertices",
                                 isParametricPath || isListPath);
                      result.set("hasWeightedVertices", false);
                      result.set("pathType",
                                 isPointsPath       ? "points"
                                 : isParametricPath ? "parametric"
                                                    : "other");

                      if (object->is<rive::Component>())
                      {
                          auto* component = object->as<rive::Component>();
                          result.set("name", component->name());
                          auto* parent = component->parent();
                          if (parent != nullptr)
                          {
                              result.set("parentName", parent->name());
                              for (size_t objectIndex = 0;
                                   objectIndex < objects.size();
                                   ++objectIndex)
                              {
                                  if (objects[objectIndex] == parent)
                                  {
                                      result.set("parentIndex",
                                                 static_cast<int>(objectIndex));
                                      break;
                                  }
                              }
                          }
                      }

                      if (isPath)
                      {
                          auto* path = object->as<rive::Path>();
                          auto* shape = path->shape();
                          const bool pathHidden = path->isHidden();
                          const bool pathCollapsed = path->isCollapsed();
                          const bool shapeHidden =
                              shape != nullptr && shape->isHidden();
                          const bool shapeCollapsed =
                              shape != nullptr && shape->isCollapsed();
                          const auto& vertices = path->vertices();
                          bool hasWeightedVertices = false;
                          for (auto* vertex : vertices)
                          {
                              if (vertex != nullptr && vertex->hasWeight())
                              {
                                  hasWeightedVertices = true;
                                  break;
                              }
                          }
                          result.set("vertexCount", vertices.size());
                          result.set("hasWeightedVertices",
                                     hasWeightedVertices);
                          result.set("shapeName",
                                     shape == nullptr ? "" : shape->name());
                          if (shape != nullptr)
                          {
                              for (size_t objectIndex = 0;
                                   objectIndex < objects.size();
                                   ++objectIndex)
                              {
                                  if (objects[objectIndex] == shape)
                                  {
                                      result.set("shapeIndex",
                                                 static_cast<int>(objectIndex));
                                      break;
                                  }
                              }
                          }
                          result.set("hidden", pathHidden || shapeHidden);
                          result.set("collapsed",
                                     pathCollapsed || shapeCollapsed);
                          result.set("pathHidden", pathHidden);
                          result.set("shapeHidden", shapeHidden);
                          result.set("pathCollapsed", pathCollapsed);
                          result.set("shapeCollapsed", shapeCollapsed);
                      }
                      return result;
                  }))
        .function("debugPathVertexCount",
                  optional_override([](rive::ArtboardInstance& self,
                                       size_t objectIndex) -> size_t {
                      const auto& objects = self.objects();
                      if (objectIndex >= objects.size() ||
                          objects[objectIndex] == nullptr ||
                          !objects[objectIndex]->is<rive::Path>())
                      {
                          return 0;
                      }
                      return objects[objectIndex]
                          ->as<rive::Path>()
                          ->vertices()
                          .size();
                  }))
        .function("debugPathVertexInfo",
                  optional_override([](rive::ArtboardInstance& self,
                                       size_t objectIndex,
                                       size_t vertexIndex) -> emscripten::val {
                      const auto& objects = self.objects();
                      if (objectIndex >= objects.size() ||
                          objects[objectIndex] == nullptr ||
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
                      emscripten::val result = emscripten::val::object();
                      result.set("index", vertexIndex);
                      result.set("x", vertex->x());
                      result.set("y", vertex->y());
                      auto renderPoint = vertex->renderTranslation();
                      result.set("renderX", renderPoint[0]);
                      result.set("renderY", renderPoint[1]);
                      result.set("hasWeight", vertex->hasWeight());
                      const bool cubic = vertex->is<rive::CubicVertex>();
                      result.set("isCubic", cubic);
                      if (cubic)
                      {
                          auto* cubicVertex = vertex->as<rive::CubicVertex>();
                          auto inPoint = cubicVertex->inPoint();
                          auto outPoint = cubicVertex->outPoint();
                          auto renderInPoint = cubicVertex->renderIn();
                          auto renderOutPoint = cubicVertex->renderOut();
                          result.set("inX", inPoint[0]);
                          result.set("inY", inPoint[1]);
                          result.set("outX", outPoint[0]);
                          result.set("outY", outPoint[1]);
                          result.set("renderInX", renderInPoint[0]);
                          result.set("renderInY", renderInPoint[1]);
                          result.set("renderOutX", renderOutPoint[0]);
                          result.set("renderOutY", renderOutPoint[1]);
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
                          objects[objectIndex] == nullptr ||
                          !objects[objectIndex]->is<rive::PointsPath>() ||
                          !std::isfinite(x) || !std::isfinite(y))
                      {
                          return false;
                      }
                      auto* path = objects[objectIndex]->as<rive::PointsPath>();
                      auto& vertices = path->vertices();
                      if (vertexIndex >= vertices.size())
                      {
                          return false;
                      }
                      auto* vertex = vertices[vertexIndex];
                      vertex->x(x);
                      vertex->y(y);
                      path->markPathDirty();
                      // Flush skin deformation, path rebuilding, and dependent
                      // shape composition on this same ArtboardInstance. No
                      // new artboard is created and JS can verify immediately.
                      self.advance(0.0f);
                      return true;
                  }))
        .function("debugParametricInfo",
                  optional_override([](rive::ArtboardInstance& self,
                                       size_t objectIndex) -> emscripten::val {
                      const auto& objects = self.objects();
                      if (objectIndex >= objects.size() ||
                          objects[objectIndex] == nullptr ||
                          !objects[objectIndex]->is<rive::ParametricPath>())
                      {
                          return emscripten::val::null();
                      }
                      auto* object = objects[objectIndex];
                      auto* path = object->as<rive::ParametricPath>();
                      std::string concreteType = "ParametricPath";
                      if (object->is<rive::Rectangle>())
                      {
                          concreteType = "Rectangle";
                      }
                      else if (object->is<rive::Ellipse>())
                      {
                          concreteType = "Ellipse";
                      }
                      else if (object->is<rive::Star>())
                      {
                          concreteType = "Star";
                      }
                      else if (object->is<rive::Polygon>())
                      {
                          concreteType = "Polygon";
                      }
                      else if (object->is<rive::Triangle>())
                      {
                          concreteType = "Triangle";
                      }

                      emscripten::val result = emscripten::val::object();
                      emscripten::val properties = emscripten::val::array();
                      auto addProperty = [&properties](const std::string& name,
                                                       double value,
                                                       const std::string& kind,
                                                       const std::string& group) {
                          emscripten::val property =
                              emscripten::val::object();
                          property.set("name", name);
                          property.set("value", value);
                          property.set("kind", kind);
                          property.set("group", group);
                          properties.call<void>("push", property);
                      };
                      result.set("index", objectIndex);
                      result.set("typeKey", object->coreType());
                      result.set("concreteType", concreteType);
                      addProperty("x", path->x(), "number", "transform");
                      addProperty("y", path->y(), "number", "transform");
                      addProperty("rotation",
                                  path->rotation(),
                                  "number",
                                  "transform");
                      addProperty("width", path->width(), "number", "size");
                      addProperty("height", path->height(), "number", "size");
                      addProperty("originX",
                                  path->originX(),
                                  "number",
                                  "size");
                      addProperty("originY",
                                  path->originY(),
                                  "number",
                                  "size");

                      if (object->is<rive::Rectangle>())
                      {
                          auto* rectangle = object->as<rive::Rectangle>();
                          addProperty("linkCornerRadius",
                                      rectangle->linkCornerRadius() ? 1.0 : 0.0,
                                      "boolean",
                                      "shape");
                          addProperty("cornerRadiusTL",
                                      rectangle->cornerRadiusTL(),
                                      "number",
                                      "shape");
                          addProperty("cornerRadiusTR",
                                      rectangle->cornerRadiusTR(),
                                      "number",
                                      "shape");
                          addProperty("cornerRadiusBL",
                                      rectangle->cornerRadiusBL(),
                                      "number",
                                      "shape");
                          addProperty("cornerRadiusBR",
                                      rectangle->cornerRadiusBR(),
                                      "number",
                                      "shape");
                      }
                      if (object->is<rive::Polygon>())
                      {
                          auto* polygon = object->as<rive::Polygon>();
                          addProperty("points",
                                      polygon->points(),
                                      "integer",
                                      "shape");
                          addProperty("cornerRadius",
                                      polygon->cornerRadius(),
                                      "number",
                                      "shape");
                      }
                      if (object->is<rive::Star>())
                      {
                          addProperty("innerRadius",
                                      object->as<rive::Star>()->innerRadius(),
                                      "number",
                                      "shape");
                      }
                      result.set("properties", properties);
                      return result;
                  }))
        .function("debugSetParametricProperty",
                  optional_override([](rive::ArtboardInstance& self,
                                       size_t objectIndex,
                                       const std::string& propertyName,
                                       double value) -> bool {
                      const auto& objects = self.objects();
                      if (objectIndex >= objects.size() ||
                          objects[objectIndex] == nullptr ||
                          !objects[objectIndex]->is<rive::ParametricPath>() ||
                          !std::isfinite(value))
                      {
                          return false;
                      }
                      auto* object = objects[objectIndex];
                      auto* path = object->as<rive::ParametricPath>();
                      const float floatValue = static_cast<float>(value);
                      bool supported = true;
                      if (propertyName == "x")
                      {
                          path->x(floatValue);
                      }
                      else if (propertyName == "y")
                      {
                          path->y(floatValue);
                      }
                      else if (propertyName == "rotation")
                      {
                          path->rotation(floatValue);
                      }
                      else if (propertyName == "width")
                      {
                          path->width(floatValue);
                      }
                      else if (propertyName == "height")
                      {
                          path->height(floatValue);
                      }
                      else if (propertyName == "originX")
                      {
                          path->originX(floatValue);
                      }
                      else if (propertyName == "originY")
                      {
                          path->originY(floatValue);
                      }
                      else if (object->is<rive::Rectangle>() &&
                               propertyName == "linkCornerRadius")
                      {
                          if (value != 0.0 && value != 1.0)
                          {
                              return false;
                          }
                          object->as<rive::Rectangle>()->linkCornerRadius(
                              value == 1.0);
                      }
                      else if (object->is<rive::Rectangle>() &&
                               propertyName == "cornerRadiusTL")
                      {
                          object->as<rive::Rectangle>()->cornerRadiusTL(
                              floatValue);
                      }
                      else if (object->is<rive::Rectangle>() &&
                               propertyName == "cornerRadiusTR")
                      {
                          object->as<rive::Rectangle>()->cornerRadiusTR(
                              floatValue);
                      }
                      else if (object->is<rive::Rectangle>() &&
                               propertyName == "cornerRadiusBL")
                      {
                          object->as<rive::Rectangle>()->cornerRadiusBL(
                              floatValue);
                      }
                      else if (object->is<rive::Rectangle>() &&
                               propertyName == "cornerRadiusBR")
                      {
                          object->as<rive::Rectangle>()->cornerRadiusBR(
                              floatValue);
                      }
                      else if (object->is<rive::Polygon>() &&
                               propertyName == "points")
                      {
                          if (value < 1.0 ||
                              value > std::numeric_limits<uint32_t>::max() ||
                              std::floor(value) != value)
                          {
                              return false;
                          }
                          object->as<rive::Polygon>()->points(
                              static_cast<uint32_t>(value));
                      }
                      else if (object->is<rive::Polygon>() &&
                               propertyName == "cornerRadius")
                      {
                          object->as<rive::Polygon>()->cornerRadius(floatValue);
                      }
                      else if (object->is<rive::Star>() &&
                               propertyName == "innerRadius")
                      {
                          object->as<rive::Star>()->innerRadius(floatValue);
                      }
                      else
                      {
                          supported = false;
                      }
                      if (!supported)
                      {
                          return false;
                      }
                      path->markPathDirty();
                      self.advance(0.0f);
                      return true;
                  }))
        .function("flattenPath",'''

replace_once(BINDINGS, anchor, insert)
print("Patched Rive runtime and WASM bindings for Rive Rider geometry access.")
