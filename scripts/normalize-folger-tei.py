#!/usr/bin/env python3
"""
normalize-folger-tei.py

Converts raw Folger Digital Texts TEI XML to DraCor-compatible TEI XML
for plays not present in the DraCor Shakespeare corpus (e.g. The Two Noble Kinsmen).

The Folger raw format uses:
  - Word-level tokenization: <w>, <c>, <pc> elements
  - <milestone unit="ftln" xml:id="ftln-N" n="ACT.SCENE.LINE"> for line markers
  - <div1 type="act">, <div2 type="scene"> for structure
  - <particDesc><listPerson><person xml:id="CharId"> for cast list
  - <sp who="#CharId">, <stage type="..." who="..."> (same as DraCor, keep)

Output DraCor-compatible format uses:
  - Plain text in <l xml:id="ftln-N"> for verse lines
  - Plain text in <p><lb xml:id="ftln-N"/>text</p> for prose
  - <div type="act" n="N">, <div type="scene" n="N">
  - <castList><castItem sameAs="#CharId"><role><name>CharName</name></role></castItem>
  - <sp who="#CharId">, <stage type="..." who="..."> (unchanged)

Usage:
    python3 scripts/normalize-folger-tei.py <input.xml> <output.xml>
"""

import sys
import re
import xml.etree.ElementTree as ET

TEI_NS = "http://www.tei-c.org/ns/1.0"

def ns(tag):
    return f"{{{TEI_NS}}}{tag}"

def strip_ns(tag):
    """Strip namespace from tag."""
    if tag.startswith("{"):
        return tag.split("}")[1]
    return tag

def get_text_of_element(el):
    """
    Reconstruct plain text from a word-tokenized element.
    Joins <w>, <c>, <pc>, <lb> (strip), <milestone> (strip) etc.
    Returns a single string.
    """
    parts = []
    # Handle text directly on element
    if el.text:
        parts.append(el.text)
    for child in el:
        tag = strip_ns(child.tag)
        if tag in ("w", "c", "pc"):
            # Word, connector (space), punctuation — get their text
            text = "".join(child.itertext())
            parts.append(text)
        elif tag in ("lb", "milestone", "sound"):
            # Line break, milestone markers, sound — skip
            pass
        elif tag in ("add", "del", "corr", "reg", "choice", "orig", "sic"):
            # Editorial markup — take the text
            parts.append("".join(child.itertext()))
        elif tag == "seg":
            parts.append("".join(child.itertext()))
        elif tag == "foreign":
            parts.append("".join(child.itertext()))
        else:
            # Recurse for nested elements
            parts.append(get_text_of_element(child))
        if child.tail:
            parts.append(child.tail)
    return "".join(parts).strip()

def get_speaker_text(sp_el):
    """Get speaker tag text from <speaker> child."""
    speaker = sp_el.find(ns("speaker"))
    if speaker is not None:
        return get_text_of_element(speaker).strip()
    return ""

def collect_lines_from_sp(sp_el):
    """
    Walk an <sp> element and collect (line_id, text, is_prose) tuples.
    Lines are delimited by <milestone unit="ftln"> elements.
    Words following a milestone (same n= value) are grouped into that line.
    """
    # First, build a mapping from ftln n-value to list of (tag, text) segments in order
    # We'll do a flat walk of the sp element

    # Collect all milestones and their associated text
    lines = []  # list of {"id": "ftln-NNNN", "n": "ACT.SC.LN", "is_prose": bool, "words": []}
    current_line = None

    def walk(el):
        nonlocal current_line
        tag = strip_ns(el.tag)

        if tag == "milestone" and el.get("unit") == "ftln":
            ftln_id = el.get(ns("id")) or el.get("xml:id") or el.get("{http://www.w3.org/XML/1998/namespace}id")
            ftln_n = el.get("n", "")
            # ana attribute might contain "#verse" or "#prose"
            ana = el.get("ana", "")
            is_prose = "#prose" in ana
            current_line = {"id": ftln_id, "n": ftln_n, "is_prose": is_prose, "words": []}
            lines.append(current_line)
            return

        if tag in ("speaker", "stage"):
            # Skip speaker and embedded stage directions from line content
            return

        if tag in ("w", "c", "pc"):
            text = "".join(el.itertext())
            if text and current_line is not None:
                current_line["words"].append(text)
            return

        if tag in ("lb",):
            # prose line break — if we're in a prose line, can mark it
            return

        if tag in ("add", "corr", "reg", "choice", "orig", "sic", "seg", "foreign", "unclear"):
            # Editorial — take text
            text = "".join(el.itertext())
            if text and current_line is not None:
                current_line["words"].append(text)
            return

        if tag == "sound":
            return

        # Recurse
        for child in el:
            walk(child)

    walk(sp_el)

    # Build final lines
    result = []
    for line in lines:
        text = "".join(line["words"]).strip()
        if text:
            result.append({
                "id": line["id"],
                "n": line["n"],
                "is_prose": line["is_prose"],
                "text": text,
            })
    return result


def build_cast_list(root):
    """
    Build a list of (char_id, char_name) from Folger's <particDesc><listPerson>.
    Returns list of (id, name) tuples.
    """
    cast = []
    seen = set()
    for person in root.iter(ns("person")):
        char_id = (
            person.get(ns("id"))
            or person.get("xml:id")
            or person.get("{http://www.w3.org/XML/1998/namespace}id")
            or ""
        )
        if not char_id or char_id in seen:
            continue
        seen.add(char_id)
        # Get name from <persName><name>
        name_el = person.find(f".//{ns('name')}")
        if name_el is not None and name_el.text:
            name = name_el.text.strip()
        else:
            # Fallback: use the ID stem
            name = char_id.split("_")[0].replace("#", "").title()
        cast.append((f"#{char_id}", name))
    return cast


def normalize(input_path, output_path):
    ET.register_namespace("", TEI_NS)
    tree = ET.parse(input_path)
    root = tree.getroot()

    # Get title
    title_el = root.find(f".//{ns('titleStmt')}/{ns('title')}")
    title_text = (title_el.text or "Unknown Play").strip() if title_el is not None else "Unknown Play"

    # Get play ID from publicationStmt/idno
    idno_el = root.find(f".//{ns('publicationStmt')}/{ns('idno')}")
    play_id = (idno_el.text or "UNK").strip() if idno_el is not None else "UNK"

    # Collect cast
    cast_items = build_cast_list(root)

    # ── Build output XML ──
    # We'll build it as a string to avoid namespace headaches
    lines_out = []
    lines_out.append('<?xml version="1.0" encoding="utf-8"?>')
    lines_out.append(f'<TEI xmlns="http://www.tei-c.org/ns/1.0">')
    lines_out.append('<teiHeader>')
    lines_out.append('<fileDesc>')
    lines_out.append('<titleStmt>')
    lines_out.append(f'<title>{xml_escape(title_text)}</title>')
    lines_out.append('</titleStmt>')
    lines_out.append('</fileDesc>')
    lines_out.append('</teiHeader>')
    lines_out.append('<text>')
    lines_out.append('<front>')
    lines_out.append('<castList>')
    for char_id, char_name in cast_items:
        # castItem sameAs="#CharId"
        lines_out.append(f'<castItem sameAs="{xml_escape(char_id)}">')
        lines_out.append(f'<role><name>{xml_escape(char_name)}</name></role>')
        lines_out.append('</castItem>')
    lines_out.append('</castList>')
    lines_out.append('</front>')
    lines_out.append('<body>')

    # Walk acts and scenes
    # Folger uses <div1 type="act"> and <div2 type="scene">
    body = root.find(f".//{ns('body')}")
    if body is None:
        print("ERROR: No <body> found", file=sys.stderr)
        sys.exit(1)

    act_num = 0
    for div1 in body:
        tag = strip_ns(div1.tag)
        if tag != "div1":
            continue
        div1_type = div1.get("type", "")
        div1_n = div1.get("n", "")

        if div1_type in ("act",):
            act_num += 1
            # Get act head text
            head = div1.find(ns("head"))
            head_text = get_text_of_element(head) if head is not None else f"ACT {act_num}"
            lines_out.append(f'<div type="act" n="{act_num}">')
            lines_out.append(f'<head>{xml_escape(head_text)}</head>')

            scene_num = 0
            for div2 in div1:
                tag2 = strip_ns(div2.tag)
                if tag2 != "div2":
                    continue
                div2_type = div2.get("type", "")
                if div2_type not in ("scene",):
                    continue
                scene_num += 1
                head2 = div2.find(ns("head"))
                head2_text = get_text_of_element(head2) if head2 is not None else f"Scene {scene_num}"
                scene_id = f"TNK.{act_num}.{scene_num}"
                lines_out.append(f'<div type="scene" n="{scene_num}" xml:id="{scene_id}">')
                lines_out.append(f'<head>{xml_escape(head2_text)}</head>')

                # Walk scene contents: <stage> and <sp>
                for unit in div2:
                    utag = strip_ns(unit.tag)

                    if utag == "stage":
                        stage_type = unit.get("type", "")
                        stage_who = unit.get("who", "")
                        stage_text = get_text_of_element(unit)
                        attrs = f' type="{xml_escape(stage_type)}"' if stage_type else ""
                        if stage_who:
                            attrs += f' who="{xml_escape(stage_who)}"'
                        stage_id = unit.get(ns("id")) or unit.get("xml:id") or unit.get("{http://www.w3.org/XML/1998/namespace}id") or ""
                        if stage_id:
                            attrs += f' xml:id="{xml_escape(stage_id)}"'
                        lines_out.append(f'<stage{attrs}>{xml_escape(stage_text)}</stage>')

                    elif utag == "sp":
                        sp_who = unit.get("who", "")
                        sp_id = unit.get(ns("id")) or unit.get("xml:id") or unit.get("{http://www.w3.org/XML/1998/namespace}id") or ""
                        speaker_text = get_speaker_text(unit)

                        sp_attrs = f' who="{xml_escape(sp_who)}"'
                        if sp_id:
                            sp_attrs += f' xml:id="{xml_escape(sp_id)}"'
                        lines_out.append(f'<sp{sp_attrs}>')
                        lines_out.append(f'<speaker>{xml_escape(speaker_text)}</speaker>')

                        speech_lines = collect_lines_from_sp(unit)

                        if not speech_lines:
                            # No FTLN lines found — emit as a single prose block
                            text = get_text_of_element(unit)
                            if text:
                                lines_out.append(f'<p><lb/>{xml_escape(text)}</p>')
                        else:
                            # Group consecutive prose lines into <p> blocks
                            # and verse lines as individual <l>
                            i = 0
                            while i < len(speech_lines):
                                sline = speech_lines[i]
                                if sline["is_prose"]:
                                    # Collect consecutive prose lines
                                    lines_out.append('<p>')
                                    while i < len(speech_lines) and speech_lines[i]["is_prose"]:
                                        sl = speech_lines[i]
                                        lb_id = f' xml:id="{xml_escape(sl["id"])}"' if sl["id"] else ""
                                        lines_out.append(f'<lb{lb_id}/>{xml_escape(sl["text"])}')
                                        i += 1
                                    lines_out.append('</p>')
                                else:
                                    # Verse line
                                    sl = speech_lines[i]
                                    l_id = f' xml:id="{xml_escape(sl["id"])}"' if sl["id"] else ""
                                    lines_out.append(f'<l{l_id}>{xml_escape(sl["text"])}</l>')
                                    i += 1

                        lines_out.append('</sp>')

                lines_out.append('</div>')  # end scene

            lines_out.append('</div>')  # end act

        elif div1_type in ("prologue", "epilogue"):
            # Treat as a standalone scene
            ptype = "prologue" if div1_type == "prologue" else "epilogue"
            head_el = div1.find(ns("head"))
            head_txt = get_text_of_element(head_el) if head_el is not None else div1_type.upper()
            lines_out.append(f'<div type="act" n="{ptype}">')
            lines_out.append(f'<head>{xml_escape(head_txt)}</head>')
            lines_out.append(f'<div type="scene" n="1" xml:id="TNK.{ptype}.1">')
            lines_out.append(f'<head>{xml_escape(head_txt)}</head>')

            for unit in div1:
                utag = strip_ns(unit.tag)
                if utag == "stage":
                    stage_type = unit.get("type", "")
                    stage_who = unit.get("who", "")
                    stage_text = get_text_of_element(unit)
                    attrs = f' type="{xml_escape(stage_type)}"' if stage_type else ""
                    if stage_who:
                        attrs += f' who="{xml_escape(stage_who)}"'
                    lines_out.append(f'<stage{attrs}>{xml_escape(stage_text)}</stage>')
                elif utag == "sp":
                    sp_who = unit.get("who", "")
                    sp_id = unit.get(ns("id")) or unit.get("xml:id") or unit.get("{http://www.w3.org/XML/1998/namespace}id") or ""
                    speaker_text = get_speaker_text(unit)
                    sp_attrs = f' who="{xml_escape(sp_who)}"'
                    if sp_id:
                        sp_attrs += f' xml:id="{xml_escape(sp_id)}"'
                    lines_out.append(f'<sp{sp_attrs}>')
                    lines_out.append(f'<speaker>{xml_escape(speaker_text)}</speaker>')
                    speech_lines = collect_lines_from_sp(unit)
                    if not speech_lines:
                        text = get_text_of_element(unit)
                        if text:
                            lines_out.append(f'<p><lb/>{xml_escape(text)}</p>')
                    else:
                        for sl in speech_lines:
                            if sl["is_prose"]:
                                lb_id = f' xml:id="{xml_escape(sl["id"])}"' if sl["id"] else ""
                                lines_out.append(f'<p><lb{lb_id}/>{xml_escape(sl["text"])}</p>')
                            else:
                                l_id = f' xml:id="{xml_escape(sl["id"])}"' if sl["id"] else ""
                                lines_out.append(f'<l{l_id}>{xml_escape(sl["text"])}</l>')
                    lines_out.append('</sp>')

            lines_out.append('</div>')  # scene
            lines_out.append('</div>')  # act

    lines_out.append('</body>')
    lines_out.append('</text>')
    lines_out.append('</TEI>')

    output = "\n".join(lines_out)
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(output)

    print(f"Written: {output_path}")
    print(f"  Acts: {act_num}")
    print(f"  Cast entries: {len(cast_items)}")


def xml_escape(s):
    return (str(s)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;"))


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(f"Usage: {sys.argv[0]} <input.xml> <output.xml>")
        sys.exit(1)
    normalize(sys.argv[1], sys.argv[2])
