from pathlib import Path
from reportlab.platypus import SimpleDocTemplate,Paragraph,Spacer
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from xml.sax.saxutils import escape
from PIL import Image,ImageDraw,ImageFont
from openpyxl import load_workbook
import zipfile
R=Path(__file__).resolve().parents[1]
styles=getSampleStyleSheet();styles['Normal'].leading=15;styles['Normal'].spaceAfter=9
story=[]
for block in (R/'source/guide.md').read_text().split('\n\n'):
 if block.startswith('#'):
  lines=block.split('\n',1);heading=lines[0];style='Title' if heading.startswith('# ') else 'Heading2'
  story.append(Paragraph(escape(heading.lstrip('# ')),styles[style]))
  if len(lines)>1:story.append(Paragraph(escape(lines[1]),styles['Normal']))
 else:story.append(Paragraph(escape(block),styles['Normal']))
 story.append(Spacer(1,4))
def footer(c,d):
 c.setFont('Helvetica',9);c.setFillColor(colors.HexColor('#536779'));c.drawString(42,25,'Contractor Profit Toolkit | 1.2');c.drawRightString(570,25,str(d.page))
SimpleDocTemplate(str(R/'deliverables/User_Guide.pdf'),pagesize=letter,rightMargin=42,leftMargin=42,topMargin=42,bottomMargin=42).build(story,onFirstPage=footer,onLaterPages=footer)
font='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
def f(size):return ImageFont.truetype(font,size)
def image(name,title,subtitle,lines):
 im=Image.new('RGB',(1600,1200),'#F4F7F9');d=ImageDraw.Draw(im);d.rectangle((0,0,1600,260),fill='#16324F');d.text((70,60),title,font=f(50),fill='white');d.text((70,145),subtitle,font=f(26),fill='#CCE0EC')
 for i,(label,val) in enumerate(lines):
  y=310+i*110;d.rounded_rectangle((70,y,1530,y+90),radius=12,fill='white');d.text((100,y+26),label,font=f(27),fill='#243746');d.text((1080,y+26),val,font=f(27),fill='#1457A0')
 d.text((70,1135),'Fictional example • Management aid • No financial guarantees',font=f(23),fill='#536779');im.save(R/'listing'/name)
image('01-overview.png','CONTRACTOR PROFIT TOOLKIT','Single-job planning and tracking | Offline XLSX',['Estimate costs and cost-based markup','Approved change orders','Actual costs and customer receipts','Contribution margin dashboard','Blank workbook + example + PDF guide'] and [(x,'Included') for x in ['Cost-based estimate','Approved change orders','Actual cost ledger','Payments received','PDF guide + blank/example XLSX']])
w=load_workbook(R/'deliverables/Contractor_Profit_Toolkit_Example.xlsx',data_only=True)
rows=[6,10,11,15,18,19];lines=[(w['Dashboard'][f'A{r}'].value,'$'+format(w['Dashboard'][f'B{r}'].value,',.2f')) for r in rows]
image('02-dashboard-example.png','YOUR JOB AT A GLANCE','Illustrated dashboard figures from the included fictional workbook',lines)
image('03-how-it-works.png','A SIMPLE WEEKLY WORKFLOW','No macros • No subscriptions • No external API',[(x,str(i+1)) for i,x in enumerate(['Set project overhead assumptions','Build your base estimate','Record costs exactly once','Approve changes and log receipts','Review warnings and provisional margin'])])
with zipfile.ZipFile(R/'deliverables/Contractor_Profit_Toolkit_Package.zip','w',zipfile.ZIP_DEFLATED) as z:
 for p in (R/'deliverables').iterdir():
  if p.suffix in ['.xlsx','.pdf','.txt']:z.write(p,p.name)
print('PDF, 3 listing images and customer ZIP built.')
