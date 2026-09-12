import { MARKETING_CATEGORIES } from "@/lib/marketing-categories";
import styles from "./marketing.module.css";

export function Categories() {
  return (
    <>
      <div className={styles.categories}>
        {MARKETING_CATEGORIES.map((category) => (
          <section key={category.title}>
            <h3>{category.title}</h3>
            <p>{category.description}</p>
            <ul aria-label={"Fähigkeiten: " + category.title}>
              {category.skills.map((skill) => <li key={skill}>{skill}</li>)}
            </ul>
          </section>
        ))}
      </div>
      <p className={styles.subtle}>
        Diese Beispiele stammen aus dem hinterlegten Skill-Vokabular. Sie sind
        keine Zusage, dass für jede Kombination passende oder verfügbare Profile vorliegen.
      </p>
    </>
  );
}
