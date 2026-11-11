import re
import docx
from docx.shared import Inches, Pt, Mm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import nsdecls, qn

def set_cell_background(cell, fill_hex):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{fill_hex}"/>')
    tcPr.append(shd)

def set_cell_margins(cell, top=100, bottom=100, left=150, right=150):
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = OxmlElement('w:tcMar')
    for m, val in [('top', top), ('bottom', bottom), ('left', left), ('right', right)]:
        node = OxmlElement(f'w:{m}')
        node.set(qn('w:w'), str(val))
        node.set(qn('w:type'), 'dxa')
        tcMar.append(node)
    tcPr.append(tcMar)

def set_table_borders(table):
    tblPr = table._tbl.tblPr
    borders = parse_xml(
        f'<w:tblBorders {nsdecls("w")}>'
        f'<w:top w:val="single" w:sz="6" w:space="0" w:color="888888"/>'
        f'<w:left w:val="none"/>'
        f'<w:bottom w:val="single" w:sz="6" w:space="0" w:color="888888"/>'
        f'<w:right w:val="none"/>'
        f'<w:insideH w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>'
        f'<w:insideV w:val="none"/>'
        f'</w:tblBorders>'
    )
    tblPr.append(borders)

def add_page_number_to_footer(footer):
    p = footer.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.line_spacing = 1.15
    run = p.add_run()
    run.font.name = 'Times New Roman'
    run.font.size = Pt(10)
    
    fldChar1 = OxmlElement('w:fldChar')
    fldChar1.set(qn('w:fldCharType'), 'begin')
    instrText = OxmlElement('w:instrText')
    instrText.set(qn('xml:space'), 'preserve')
    instrText.text = "PAGE"
    fldChar2 = OxmlElement('w:fldChar')
    fldChar2.set(qn('w:fldCharType'), 'separate')
    fldChar3 = OxmlElement('w:fldChar')
    fldChar3.set(qn('w:fldCharType'), 'end')
    
    run._r.append(fldChar1)
    run._r.append(instrText)
    run._r.append(fldChar2)
    run._r.append(fldChar3)

def create_report():
    doc = docx.Document()
    
    # 1. Page Setup & Margins
    for section in doc.sections:
        section.page_width = Mm(210)
        section.page_height = Mm(297)
        section.top_margin = Mm(25.4)
        section.bottom_margin = Mm(25.4)
        section.left_margin = Mm(25.4)
        section.right_margin = Mm(25.4)
        add_page_number_to_footer(section.footer)
        
    # Set default style font
    style_normal = doc.styles['Normal']
    font = style_normal.font
    font.name = 'Times New Roman'
    font.size = Pt(12)
    font.color.rgb = RGBColor(0x22, 0x22, 0x22)
    style_normal.paragraph_format.line_spacing = 1.15
    style_normal.paragraph_format.space_after = Pt(4)
    style_normal.paragraph_format.space_before = Pt(0)
    
    with open('MAJOR_PROJECT_REPORT_KRYPT.md', 'r', encoding='utf-8') as f:
        md_text = f.read()

    lines = md_text.splitlines()
    
    i = 0
    in_table = False
    table_rows = []
    in_code_block = False
    code_lines = []
    
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()
        
        # Check for code blocks / placeholders
        if stripped.startswith('```'):
            if in_code_block:
                in_code_block = False
                # Render code block / box placeholder
                content = "\n".join(code_lines)
                code_lines = []
                p = doc.add_paragraph()
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                p.paragraph_format.space_before = Pt(6)
                p.paragraph_format.space_after = Pt(6)
                p.paragraph_format.line_spacing = 1.15
                
                # Check if it is a figure placeholder
                is_fig = "Placeholder" in content or "Figure" in content
                run = p.add_run(content)
                run.font.name = 'Times New Roman'
                run.font.size = Pt(11) if is_fig else Pt(10)
                run.font.italic = is_fig
                if not is_fig:
                    run.font.color.rgb = RGBColor(0x11, 0x22, 0x44)
            else:
                in_code_block = True
                code_lines = []
            i += 1
            continue
            
        if in_code_block:
            code_lines.append(line)
            i += 1
            continue
            
        # Check for markdown tables
        if stripped.startswith('|') and stripped.endswith('|'):
            table_rows.append([c.strip() for c in stripped.strip('|').split('|')])
            i += 1
            continue
        elif table_rows:
            # End of table, render it
            # Remove separator row if present
            cleaned_rows = []
            for r in table_rows:
                if all(re.match(r'^:?-+:?$', c) for c in r if c):
                    continue
                cleaned_rows.append(r)
            if cleaned_rows:
                num_cols = max(len(r) for r in cleaned_rows)
                t = doc.add_table(rows=len(cleaned_rows), cols=num_cols)
                t.alignment = WD_TABLE_ALIGNMENT.CENTER
                set_table_borders(t)
                for r_idx, r_data in enumerate(cleaned_rows):
                    row = t.rows[r_idx]
                    is_header = (r_idx == 0)
                    for c_idx in range(num_cols):
                        cell = row.cells[c_idx]
                        set_cell_margins(cell, top=100, bottom=100, left=120, right=120)
                        if is_header:
                            set_cell_background(cell, "F0F4F8")
                        cell_text = r_data[c_idx] if c_idx < len(r_data) else ""
                        p = cell.paragraphs[0]
                        p.alignment = WD_ALIGN_PARAGRAPH.CENTER if (is_header or c_idx == 0 or len(cell_text) < 15) else WD_ALIGN_PARAGRAPH.LEFT
                        p.paragraph_format.line_spacing = 1.15
                        p.paragraph_format.space_before = Pt(2)
                        p.paragraph_format.space_after = Pt(2)
                        run = p.add_run(cell_text)
                        run.font.name = 'Times New Roman'
                        run.font.size = Pt(11)
                        if is_header:
                            run.font.bold = True
                doc.add_paragraph() # Spacing after table
            table_rows = []

        if not stripped:
            i += 1
            continue
            
        # Check for horizontal rules
        if stripped == '---':
            p = doc.add_paragraph()
            p.paragraph_format.space_after = Pt(6)
            i += 1
            continue
            
        # Check for Table Captions: "Table X: Caption text"
        if re.match(r'^Table\s+\d+\s*:', stripped):
            p = doc.add_paragraph()
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p.paragraph_format.space_before = Pt(10)
            p.paragraph_format.space_after = Pt(4)
            p.paragraph_format.line_spacing = 1.15
            clean_caption = stripped.rstrip('.')
            run = p.add_run(clean_caption)
            run.font.name = 'Times New Roman'
            run.font.size = Pt(11)
            run.font.bold = True
            i += 1
            continue
            
        # Check for Figure Captions: "Figure X: Caption text"
        if re.match(r'^Figure\s+\d+\s*:', stripped):
            p = doc.add_paragraph()
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p.paragraph_format.space_before = Pt(4)
            p.paragraph_format.space_after = Pt(12)
            p.paragraph_format.line_spacing = 1.15
            clean_caption = stripped.rstrip('.')
            run = p.add_run(clean_caption)
            run.font.name = 'Times New Roman'
            run.font.size = Pt(11)
            run.font.bold = True
            i += 1
            continue
            
        # Check for Headings
        if stripped.startswith('# '):
            text = stripped[2:].strip()
            p = doc.add_paragraph()
            p.alignment = WD_ALIGN_PARAGRAPH.LEFT
            p.paragraph_format.space_before = Pt(14)
            p.paragraph_format.space_after = Pt(6)
            p.paragraph_format.line_spacing = 1.15
            run = p.add_run(text)
            run.font.name = 'Times New Roman'
            run.font.size = Pt(16)
            run.font.bold = True
            i += 1
            continue
            
        if stripped.startswith('## '):
            text = stripped[3:].strip()
            p = doc.add_paragraph()
            p.alignment = WD_ALIGN_PARAGRAPH.LEFT
            p.paragraph_format.space_before = Pt(12)
            p.paragraph_format.space_after = Pt(6)
            p.paragraph_format.line_spacing = 1.15
            run = p.add_run(text)
            run.font.name = 'Times New Roman'
            run.font.size = Pt(16)
            run.font.bold = True
            i += 1
            continue

        if stripped.startswith('### '):
            text = stripped[4:].strip()
            p = doc.add_paragraph()
            p.alignment = WD_ALIGN_PARAGRAPH.LEFT
            p.paragraph_format.space_before = Pt(10)
            p.paragraph_format.space_after = Pt(4)
            p.paragraph_format.line_spacing = 1.15
            run = p.add_run(text)
            run.font.name = 'Times New Roman'
            run.font.size = Pt(14)
            run.font.bold = True
            i += 1
            continue

        if stripped.startswith('#### '):
            text = stripped[5:].strip()
            p = doc.add_paragraph()
            p.alignment = WD_ALIGN_PARAGRAPH.LEFT
            p.paragraph_format.space_before = Pt(8)
            p.paragraph_format.space_after = Pt(3)
            p.paragraph_format.line_spacing = 1.15
            run = p.add_run(text)
            run.font.name = 'Times New Roman'
            run.font.size = Pt(13)
            run.font.bold = True
            i += 1
            continue

        # Check for References items: "[1] ...", "[2] ..."
        ref_match = re.match(r'^\[(\d+)\]\s*(.*)$', stripped)
        if ref_match:
            p = doc.add_paragraph()
            p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
            p.paragraph_format.line_spacing = 1.15
            p.paragraph_format.space_before = Pt(2)
            p.paragraph_format.space_after = Pt(4)
            p.paragraph_format.left_indent = Inches(0.4)
            p.paragraph_format.first_line_indent = Inches(-0.4)
            
            run_num = p.add_run(f"[{ref_match.group(1)}] ")
            run_num.font.name = 'Times New Roman'
            run_num.font.size = Pt(10)
            run_num.font.bold = True
            
            # Parse italics like *Title* or *Journal*
            body = ref_match.group(2)
            parts = re.split(r'(\*[^*]+\*)', body)
            for part in parts:
                if part.startswith('*') and part.endswith('*'):
                    r = p.add_run(part[1:-1])
                    r.font.name = 'Times New Roman'
                    r.font.size = Pt(10)
                    r.font.italic = True
                else:
                    r = p.add_run(part)
                    r.font.name = 'Times New Roman'
                    r.font.size = Pt(10)
            i += 1
            continue

        # Normal text paragraph
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
        p.paragraph_format.line_spacing = 1.15
        p.paragraph_format.space_before = Pt(0)
        p.paragraph_format.space_after = Pt(4)
        
        # Check bullet points
        is_bullet = False
        text_to_format = stripped
        if stripped.startswith('- ') or stripped.startswith('* '):
            is_bullet = True
            p.paragraph_format.left_indent = Inches(0.25)
            text_to_format = stripped[2:].strip()
        elif re.match(r'^\d+\.\s+', stripped):
            m = re.match(r'^(\d+\.)\s+(.*)$', stripped)
            is_bullet = True
            p.paragraph_format.left_indent = Inches(0.35)
            text_to_format = f"{m.group(1)} {m.group(2)}"

        # Parse bold & italic
        # Regex split by bold (**text**) and italic (*text*)
        tokens = re.split(r'(\*\*[^*]+\*\*|\*[^*]+\*)', text_to_format)
        for token in tokens:
            if not token:
                continue
            if token.startswith('**') and token.endswith('**'):
                run = p.add_run(token[2:-2])
                run.font.name = 'Times New Roman'
                run.font.size = Pt(12)
                run.font.bold = True
            elif token.startswith('*') and token.endswith('*'):
                run = p.add_run(token[1:-1])
                run.font.name = 'Times New Roman'
                run.font.size = Pt(12)
                run.font.italic = True
            else:
                run = p.add_run(token)
                run.font.name = 'Times New Roman'
                run.font.size = Pt(12)
                
        i += 1
        
    output_filename = "Krypt_Major_Project_Report.docx"
    doc.save(output_filename)
    print(f"Successfully generated: {output_filename}")

if __name__ == '__main__':
    create_report()
