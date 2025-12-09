#!/usr/bin/env python3
"""Generate an HTML visualization of the solver output."""

import json
import sys
from collections import defaultdict

# Color palette for roles
ROLE_COLORS = {
    'REG': '#4CAF50',      # Green
    'PROD': '#2196F3',     # Blue
    'P_HELM': '#FF9800',   # Orange
    'BRK': '#9C27B0',      # Purple
    'SL': '#F44336',       # Red
    'DEMO': '#00BCD4',     # Cyan
    'W_DMO': '#E91E63',    # Pink
    'ART': '#FFEB3B',      # Yellow
    'TST': '#795548',      # Brown
}

def minutes_to_time(minutes: int) -> str:
    """Convert minutes from midnight to HH:MM format."""
    hours = minutes // 60
    mins = minutes % 60
    return f"{hours:02d}:{mins:02d}"

def generate_html(solver_input: dict, solver_output: dict) -> str:
    """Generate HTML visualization of the schedule."""
    
    assignments = solver_output.get('assignments', [])
    crew_list = solver_input.get('crew', [])
    store = solver_input.get('store', {})
    
    # Build crew lookup
    crew_by_id = {c['id']: c for c in crew_list}
    
    # Group assignments by crew
    assignments_by_crew = defaultdict(list)
    for a in assignments:
        assignments_by_crew[a['crewId']].append(a)
    
    # Sort crew by shift start
    sorted_crew = sorted(crew_list, key=lambda c: (c['shiftStartMin'], c['name']))
    
    # Time range
    store_open = store.get('openMinutesFromMidnight', 480)
    store_close = store.get('closeMinutesFromMidnight', 1260)
    
    # Find earliest shift start and latest shift end
    min_time = min(c['shiftStartMin'] for c in crew_list)
    max_time = max(c['shiftEndMin'] for c in crew_list)
    
    # Round to hours
    min_hour = (min_time // 60) * 60
    max_hour = ((max_time + 59) // 60) * 60
    
    total_minutes = max_hour - min_hour
    
    html = f"""<!DOCTYPE html>
<html>
<head>
    <title>Schedule Visualization</title>
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 20px;
            background: #f5f5f5;
        }}
        h1 {{
            color: #333;
        }}
        .stats {{
            background: white;
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }}
        .legend {{
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            margin-bottom: 20px;
        }}
        .legend-item {{
            display: flex;
            align-items: center;
            gap: 5px;
            background: white;
            padding: 5px 10px;
            border-radius: 4px;
        }}
        .legend-color {{
            width: 20px;
            height: 20px;
            border-radius: 3px;
        }}
        .schedule-container {{
            background: white;
            border-radius: 8px;
            padding: 20px;
            overflow-x: auto;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }}
        .time-header {{
            display: flex;
            margin-left: 180px;
            margin-bottom: 5px;
            border-bottom: 1px solid #ddd;
        }}
        .time-label {{
            font-size: 11px;
            color: #666;
            text-align: center;
        }}
        .crew-row {{
            display: flex;
            align-items: center;
            margin-bottom: 2px;
            height: 28px;
        }}
        .crew-name {{
            width: 180px;
            font-size: 12px;
            padding-right: 10px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }}
        .timeline {{
            position: relative;
            height: 24px;
            background: #f0f0f0;
            border-radius: 3px;
        }}
        .shift-bg {{
            position: absolute;
            height: 100%;
            background: #e8e8e8;
            border-radius: 3px;
        }}
        .assignment {{
            position: absolute;
            height: 100%;
            border-radius: 3px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 10px;
            color: white;
            font-weight: 500;
            overflow: hidden;
            box-shadow: 0 1px 2px rgba(0,0,0,0.2);
        }}
        .store-hours {{
            position: absolute;
            height: 100%;
            border-left: 2px dashed #4CAF50;
            border-right: 2px dashed #F44336;
            background: rgba(255,255,255,0.3);
            pointer-events: none;
        }}
        .empty-slot {{
            position: absolute;
            height: 100%;
            background: repeating-linear-gradient(
                45deg,
                transparent,
                transparent 5px,
                rgba(255,0,0,0.1) 5px,
                rgba(255,0,0,0.1) 10px
            );
            border-radius: 3px;
        }}
    </style>
</head>
<body>
    <h1>Schedule Visualization (Relaxed - Empty Slots Allowed)</h1>
    
    <div class="stats">
        <strong>Summary:</strong> {len(assignments)} assignments across {len(crew_list)} crew members<br>
        <strong>Status:</strong> {solver_output.get('metadata', {}).get('status', 'Unknown')}<br>
        <strong>Store Hours:</strong> {minutes_to_time(store_open)} - {minutes_to_time(store_close)}
    </div>
    
    <div class="legend">
"""
    
    # Add legend
    for role, color in ROLE_COLORS.items():
        html += f'        <div class="legend-item"><div class="legend-color" style="background:{color}"></div>{role}</div>\n'
    
    html += """    </div>
    
    <div class="schedule-container">
        <div class="time-header">
"""
    
    # Time header
    pixel_per_minute = 2
    for hour in range(min_hour // 60, max_hour // 60 + 1):
        left = (hour * 60 - min_hour) * pixel_per_minute
        html += f'            <div class="time-label" style="position:absolute;left:{left}px;width:60px">{hour:02d}:00</div>\n'
    
    html += f"""        </div>
        <div style="position:relative;width:{total_minutes * pixel_per_minute}px">
"""
    
    # Each crew row
    for crew in sorted_crew:
        crew_id = crew['id']
        crew_name = crew['name']
        shift_start = crew['shiftStartMin']
        shift_end = crew['shiftEndMin']
        
        crew_assignments = sorted(assignments_by_crew.get(crew_id, []), key=lambda a: a['startTime'])
        
        # Calculate shift position
        shift_left = (shift_start - min_hour) * pixel_per_minute
        shift_width = (shift_end - shift_start) * pixel_per_minute
        
        # Store hours overlay
        store_left = max(0, (store_open - min_hour) * pixel_per_minute)
        store_width = (store_close - store_open) * pixel_per_minute
        
        html += f"""            <div class="crew-row">
                <div class="crew-name" title="{crew_name}">{crew_name}</div>
                <div class="timeline" style="width:{total_minutes * pixel_per_minute}px">
                    <div class="shift-bg" style="left:{shift_left}px;width:{shift_width}px"></div>
"""
        
        # Find empty slots (gaps in assignments)
        covered_minutes = set()
        for a in crew_assignments:
            for m in range(a['startTime'], a['endTime']):
                covered_minutes.add(m)
        
        # Show empty slots within shift
        gap_start = None
        for m in range(shift_start, shift_end):
            if m not in covered_minutes:
                if gap_start is None:
                    gap_start = m
            else:
                if gap_start is not None:
                    gap_left = (gap_start - min_hour) * pixel_per_minute
                    gap_width = (m - gap_start) * pixel_per_minute
                    html += f'                    <div class="empty-slot" style="left:{gap_left}px;width:{gap_width}px" title="Empty: {minutes_to_time(gap_start)}-{minutes_to_time(m)}"></div>\n'
                    gap_start = None
        
        # Handle gap at end of shift
        if gap_start is not None:
            gap_left = (gap_start - min_hour) * pixel_per_minute
            gap_width = (shift_end - gap_start) * pixel_per_minute
            html += f'                    <div class="empty-slot" style="left:{gap_left}px;width:{gap_width}px" title="Empty: {minutes_to_time(gap_start)}-{minutes_to_time(shift_end)}"></div>\n'
        
        # Assignments
        for a in crew_assignments:
            left = (a['startTime'] - min_hour) * pixel_per_minute
            width = (a['endTime'] - a['startTime']) * pixel_per_minute
            color = ROLE_COLORS.get(a['taskType'], '#999')
            label = a['taskType'] if width > 40 else ''
            
            html += f'                    <div class="assignment" style="left:{left}px;width:{width}px;background:{color}" title="{a["taskType"]} {minutes_to_time(a["startTime"])}-{minutes_to_time(a["endTime"])}">{label}</div>\n'
        
        html += """                </div>
            </div>
"""
    
    html += """        </div>
    </div>
</body>
</html>
"""
    
    return html


def main():
    # Load input and output
    with open('/tmp/solver_input.json', 'r') as f:
        solver_input = json.load(f)
    
    with open('/tmp/solver_output.json', 'r') as f:
        solver_output = json.load(f)
    
    html = generate_html(solver_input, solver_output)
    
    output_path = '/tmp/schedule_visualization.html'
    with open(output_path, 'w') as f:
        f.write(html)
    
    print(f"Generated: {output_path}")


if __name__ == '__main__':
    main()
